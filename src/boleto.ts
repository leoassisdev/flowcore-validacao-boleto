// boleto.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Valida linha digitável e código de barras de boleto bancário (47/44 dígitos)
// e de arrecadação/concessionária (48/44 dígitos: água, luz, tributos),
// conferindo todos os dígitos verificadores, e extrai valor e vencimento,
// já com a regra do fator de vencimento reiniciado em 22/02/2025.
// Roda em Node 18+, Cloudflare Workers, Deno, Bun e no navegador.
// Zero dependências.
//
// Referências: FEBRABAN, "Layout Padrão de Arrecadação/Recebimento com
// Utilização do Código de Barras" e especificação do Bloqueto de Cobrança;
// comunicado FEBRABAN sobre o novo ciclo do fator de vencimento (2025).

export const CRIADO_POR = "Criado por FlowCore Soluções LTDA";

export type TipoBoleto = "bancario" | "arrecadacao";

export type BoletoValido = {
  valido: true;
  tipo: TipoBoleto;
  /** 44 dígitos. */
  codigoBarras: string;
  /** 47 (bancário) ou 48 (arrecadação) dígitos, sem máscara. */
  linhaDigitavel: string;
  /** Valor em centavos; null quando o boleto não traz valor (zero) ou usa moeda de referência. */
  valorCentavos: number | null;
  /** "AAAA-MM-DD"; null quando o boleto não tem vencimento no código (fator 0000 ou arrecadação). */
  vencimento: string | null;
  /** Bancário: código do banco (3 dígitos). */
  banco?: string;
  /** Arrecadação: segmento (1 a 9) e descrição. */
  segmento?: { codigo: string; descricao: string };
};
export type BoletoInvalido = { valido: false; erro: string };
export type ResultadoBoleto = BoletoValido | BoletoInvalido;

const DIA_MS = 86_400_000;
/** Fator 1000 do ciclo original = 03/07/2000; cada ciclo tem 9000 dias (fatores 1000..9999). */
const BASE_FATOR_1000 = Date.UTC(2000, 6, 3);
const CICLO_DIAS = 9000;

const SEGMENTOS: Record<string, string> = {
  "1": "Prefeituras",
  "2": "Saneamento",
  "3": "Energia elétrica e gás",
  "4": "Telecomunicações",
  "5": "Órgãos governamentais",
  "6": "Carnês e assemelhados / empresas identificadas por CNPJ",
  "7": "Multas de trânsito",
  "9": "Uso exclusivo do banco",
};

/** Módulo 10 (pesos 2,1 da direita pra esquerda, soma dos algarismos do produto). */
export function modulo10(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let p = Number(numero[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function somaMod11(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma % 11;
}

/** Módulo 11 do DV geral do boleto bancário (resultado 0, 10 ou 11 vira 1). */
export function modulo11Bancario(numero: string): number {
  const dv = 11 - somaMod11(numero);
  return dv === 0 || dv >= 10 ? 1 : dv;
}

/** Módulo 11 da arrecadação (resto 0 ou 1 vira 0; resto 10 vira 1). */
export function modulo11Arrecadacao(numero: string): number {
  const resto = somaMod11(numero);
  if (resto === 0 || resto === 1) return 0;
  if (resto === 10) return 1;
  return 11 - resto;
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Converte o fator de vencimento em data. Como o fator reinicia em 1000 a cada
 * 9000 dias (o último reinício foi em 22/02/2025), escolhe o ciclo cuja data
 * fica mais perto da data de referência (padrão: hoje).
 */
export function fatorParaData(fator: number, dataReferencia: Date = new Date()): string | null {
  if (!Number.isInteger(fator) || fator < 0 || fator > 9999) throw new Error("Fator de vencimento inválido");
  if (fator === 0) return null;
  const ref = Date.UTC(dataReferencia.getUTCFullYear(), dataReferencia.getUTCMonth(), dataReferencia.getUTCDate());
  let melhor = BASE_FATOR_1000 + (fator - 1000) * DIA_MS;
  for (let ciclo = 1; ciclo < 10; ciclo++) {
    const candidato = BASE_FATOR_1000 + (fator - 1000 + ciclo * CICLO_DIAS) * DIA_MS;
    if (Math.abs(candidato - ref) < Math.abs(melhor - ref)) melhor = candidato;
    else break;
  }
  return iso(melhor);
}

/** Converte data ("AAAA-MM-DD") no fator de vencimento (1000..9999, com reinício de ciclo). */
export function dataParaFator(data: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error("Data inválida. Use AAAA-MM-DD");
  const dias = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - BASE_FATOR_1000) / DIA_MS);
  if (dias < 0) throw new Error("Data anterior a 03/07/2000 não é suportada");
  return (dias % CICLO_DIAS) + 1000;
}

/** Converte a linha digitável bancária (47) no código de barras (44). */
export function linhaBancariaParaCodigoBarras(linha: string): string {
  const l = linha.replace(/\D/g, "");
  if (l.length !== 47) throw new Error("Linha digitável bancária precisa ter 47 dígitos");
  return l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);
}

/** Converte o código de barras bancário (44) na linha digitável (47). */
export function codigoBarrasBancarioParaLinha(codigo: string): string {
  const c = codigo.replace(/\D/g, "");
  if (c.length !== 44) throw new Error("Código de barras precisa ter 44 dígitos");
  const campoLivre = c.slice(19);
  const c1 = c.slice(0, 4) + campoLivre.slice(0, 5);
  const c2 = campoLivre.slice(5, 15);
  const c3 = campoLivre.slice(15, 25);
  return c1 + modulo10(c1) + c2 + modulo10(c2) + c3 + modulo10(c3) + c[4] + c.slice(5, 19);
}

function moduloArrecadacao(identificador: string): ((s: string) => number) | null {
  if (identificador === "6" || identificador === "7") return modulo10;
  if (identificador === "8" || identificador === "9") return modulo11Arrecadacao;
  return null;
}

/** Converte o código de barras de arrecadação (44) na linha digitável (48). */
export function codigoBarrasArrecadacaoParaLinha(codigo: string): string {
  const c = codigo.replace(/\D/g, "");
  if (c.length !== 44 || c[0] !== "8") throw new Error("Código de arrecadação precisa ter 44 dígitos e começar com 8");
  const mod = moduloArrecadacao(c[2]);
  if (!mod) throw new Error("Identificador de valor inválido (3º dígito deve ser 6, 7, 8 ou 9)");
  let linha = "";
  for (let i = 0; i < 4; i++) {
    const bloco = c.slice(i * 11, i * 11 + 11);
    linha += bloco + mod(bloco);
  }
  return linha;
}

/** Monta um código de barras bancário válido (útil pra testes e homologação). */
export function montarCodigoBarrasBancario(p: {
  banco: string;
  vencimento: string | null;
  valorCentavos: number;
  campoLivre: string;
}): string {
  if (!/^\d{3}$/.test(p.banco)) throw new Error("Banco precisa ter 3 dígitos");
  if (!/^\d{25}$/.test(p.campoLivre)) throw new Error("Campo livre precisa ter 25 dígitos");
  if (!Number.isInteger(p.valorCentavos) || p.valorCentavos < 0 || p.valorCentavos > 9_999_999_999)
    throw new Error("Valor em centavos inválido");
  const fator = p.vencimento ? String(dataParaFator(p.vencimento)) : "0000";
  const semDv = p.banco + "9" + fator.padStart(4, "0") + String(p.valorCentavos).padStart(10, "0") + p.campoLivre;
  return semDv.slice(0, 4) + modulo11Bancario(semDv) + semDv.slice(4);
}

function analisarBancario(codigo: string, linha: string, ref: Date): ResultadoBoleto {
  if (codigo[3] !== "9") return { valido: false, erro: "Código de moeda inválido (esperado 9 = real)" };
  const semDv = codigo.slice(0, 4) + codigo.slice(5);
  if (modulo11Bancario(semDv) !== Number(codigo[4]))
    return { valido: false, erro: "Dígito verificador geral (módulo 11) não confere" };
  const fator = Number(codigo.slice(5, 9));
  const valor = Number(codigo.slice(9, 19));
  return {
    valido: true,
    tipo: "bancario",
    codigoBarras: codigo,
    linhaDigitavel: linha,
    valorCentavos: valor > 0 ? valor : null,
    vencimento: fatorParaData(fator, ref),
    banco: codigo.slice(0, 3),
  };
}

function analisarArrecadacao(codigo: string): ResultadoBoleto {
  const mod = moduloArrecadacao(codigo[2]);
  if (!mod) return { valido: false, erro: "Identificador de valor inválido (3º dígito deve ser 6, 7, 8 ou 9)" };
  const semDv = codigo.slice(0, 3) + codigo.slice(4);
  if (mod(semDv) !== Number(codigo[3])) return { valido: false, erro: "Dígito verificador geral da arrecadação não confere" };
  const valorEfetivo = codigo[2] === "6" || codigo[2] === "8";
  const valor = Number(codigo.slice(4, 15));
  const seg = codigo[1];
  return {
    valido: true,
    tipo: "arrecadacao",
    codigoBarras: codigo,
    linhaDigitavel: codigoBarrasArrecadacaoParaLinha(codigo),
    valorCentavos: valorEfetivo && valor > 0 ? valor : null,
    vencimento: null,
    segmento: { codigo: seg, descricao: SEGMENTOS[seg] ?? "Segmento desconhecido" },
  };
}

/**
 * Analisa qualquer formato: linha digitável (47/48) ou código de barras (44),
 * com ou sem pontos e espaços. Confere todos os DVs.
 */
export function analisarBoleto(entrada: string, opcoes: { dataReferencia?: Date } = {}): ResultadoBoleto {
  const d = entrada.replace(/[\s.-]/g, "");
  if (!/^\d+$/.test(d)) return { valido: false, erro: "O código deve conter apenas números" };
  const ref = opcoes.dataReferencia ?? new Date();

  if (d.length === 47) {
    const campos: [string, string][] = [
      [d.slice(0, 9), d[9]],
      [d.slice(10, 20), d[20]],
      [d.slice(21, 31), d[31]],
    ];
    for (let i = 0; i < campos.length; i++) {
      if (modulo10(campos[i][0]) !== Number(campos[i][1]))
        return { valido: false, erro: `Dígito verificador do campo ${i + 1} não confere` };
    }
    return analisarBancario(linhaBancariaParaCodigoBarras(d), d, ref);
  }

  if (d.length === 48) {
    if (d[0] !== "8") return { valido: false, erro: "Linha de arrecadação deve começar com 8" };
    const mod = moduloArrecadacao(d[2]);
    if (!mod) return { valido: false, erro: "Identificador de valor inválido (3º dígito deve ser 6, 7, 8 ou 9)" };
    let codigo = "";
    for (let i = 0; i < 4; i++) {
      const bloco = d.slice(i * 12, i * 12 + 11);
      if (mod(bloco) !== Number(d[i * 12 + 11]))
        return { valido: false, erro: `Dígito verificador do bloco ${i + 1} não confere` };
      codigo += bloco;
    }
    return analisarArrecadacao(codigo);
  }

  if (d.length === 44) {
    if (d[0] === "8") return analisarArrecadacao(d);
    const r = analisarBancario(d, "", ref);
    return r.valido ? { ...r, linhaDigitavel: codigoBarrasBancarioParaLinha(d) } : r;
  }

  return { valido: false, erro: `Tamanho inválido (${d.length} dígitos). Esperado 44, 47 ou 48` };
}

export const validarBoleto = (entrada: string) => analisarBoleto(entrada).valido;
