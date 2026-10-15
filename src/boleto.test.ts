// boleto.test.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
import { describe, expect, it } from "vitest";
import {
  analisarBoleto,
  codigoBarrasArrecadacaoParaLinha,
  codigoBarrasBancarioParaLinha,
  dataParaFator,
  fatorParaData,
  linhaBancariaParaCodigoBarras,
  modulo10,
  modulo11Arrecadacao,
  modulo11Bancario,
  montarCodigoBarrasBancario,
  validarBoleto,
} from "./boleto";

const REF = new Date("2026-10-15T12:00:00Z");

/** Monta um código de arrecadação válido a partir de 43 dígitos (sem o DV geral). */
function montarArrecadacao(semDv: string): string {
  const mod = semDv[2] === "6" || semDv[2] === "7" ? modulo10 : modulo11Arrecadacao;
  return semDv.slice(0, 3) + mod(semDv) + semDv.slice(3);
}

describe("boleto", () => {
  it("módulos 10 e 11 batem com casos de referência", () => {
    expect(modulo10("001905009")).toBe(5);
    expect(modulo10("0")).toBe(0);
    // Soma múltipla de 11 (resto 0 => 11) vira 1 no bancário e 0 na arrecadação
    expect(modulo11Bancario("0000000000000000000000000000000000000000000")).toBe(1);
    expect(modulo11Arrecadacao("0000000000000000000000000000000000000000000")).toBe(0);
  });

  it("aplica o reinício do fator de vencimento em 22/02/2025", () => {
    expect(fatorParaData(1000, new Date("2001-01-01"))).toBe("2000-07-03");
    expect(fatorParaData(9999, new Date("2025-02-01"))).toBe("2025-02-21");
    expect(fatorParaData(1000, REF)).toBe("2025-02-22");
    expect(fatorParaData(1001, REF)).toBe("2025-02-23");
    expect(dataParaFator("2025-02-21")).toBe(9999);
    expect(dataParaFator("2025-02-22")).toBe(1000);
    expect(dataParaFator("2026-10-15")).toBe(1600);
    expect(fatorParaData(0)).toBeNull();
  });

  it("valida linha digitável bancária pública (Banco do Brasil) e extrai valor", () => {
    const r = analisarBoleto("00190.50095 40144.816069 06809.350314 3 37370000000100", { dataReferencia: REF });
    expect(r).toMatchObject({ valido: true, tipo: "bancario", banco: "001", valorCentavos: 100 });
  });

  it("monta, converte e lê um boleto bancário do novo ciclo", () => {
    const codigo = montarCodigoBarrasBancario({
      banco: "341",
      vencimento: "2026-11-10",
      valorCentavos: 1_234_56,
      campoLivre: "1090000012345678901234567",
    });
    const linha = codigoBarrasBancarioParaLinha(codigo);
    expect(linha).toHaveLength(47);
    expect(linhaBancariaParaCodigoBarras(linha)).toBe(codigo);
    for (const entrada of [codigo, linha]) {
      expect(analisarBoleto(entrada, { dataReferencia: REF })).toEqual({
        valido: true,
        tipo: "bancario",
        codigoBarras: codigo,
        linhaDigitavel: linha,
        valorCentavos: 123456,
        vencimento: "2026-11-10",
        banco: "341",
      });
    }
  });

  it("boleto sem vencimento e sem valor (fator 0000, valor zerado)", () => {
    const codigo = montarCodigoBarrasBancario({ banco: "237", vencimento: null, valorCentavos: 0, campoLivre: "0".repeat(25) });
    expect(analisarBoleto(codigo)).toMatchObject({ valido: true, vencimento: null, valorCentavos: null });
  });

  it("detecta erro em cada campo da linha bancária", () => {
    const linha = codigoBarrasBancarioParaLinha(
      montarCodigoBarrasBancario({ banco: "104", vencimento: "2026-12-01", valorCentavos: 5000, campoLivre: "9".repeat(25) }),
    );
    const trocar = (s: string, i: number) => s.slice(0, i) + ((Number(s[i]) + 1) % 10) + s.slice(i + 1);
    expect(analisarBoleto(trocar(linha, 4))).toEqual({ valido: false, erro: "Dígito verificador do campo 1 não confere" });
    expect(analisarBoleto(trocar(linha, 12))).toEqual({ valido: false, erro: "Dígito verificador do campo 2 não confere" });
    expect(analisarBoleto(trocar(linha, 25))).toEqual({ valido: false, erro: "Dígito verificador do campo 3 não confere" });
    const valorAlterado = analisarBoleto(trocar(linha, 46));
    expect(valorAlterado).toMatchObject({ valido: false, erro: expect.stringContaining("módulo 11") });
  });

  it("valida a linha de arrecadação pública (energia) com módulo 10", () => {
    const r = analisarBoleto("836200000005 667800481000 180975657313 001589636081");
    expect(r).toMatchObject({
      valido: true,
      tipo: "arrecadacao",
      valorCentavos: 6678,
      vencimento: null,
      segmento: { codigo: "3", descricao: "Energia elétrica e gás" },
    });
  });

  it("monta arrecadação com módulo 11 (identificador 8) e confere os blocos", () => {
    const codigo = montarArrecadacao("858" + "00000015990" + "0270" + "2026101500000000000123456");
    expect(codigo).toHaveLength(44);
    const linha = codigoBarrasArrecadacaoParaLinha(codigo);
    expect(linha).toHaveLength(48);
    expect(analisarBoleto(linha)).toMatchObject({ valido: true, codigoBarras: codigo, valorCentavos: 15990, segmento: { codigo: "5" } });
    expect(analisarBoleto(codigo)).toMatchObject({ valido: true, linhaDigitavel: linha });
    const adulterada = linha.slice(0, 13) + ((Number(linha[13]) + 1) % 10) + linha.slice(14);
    expect(analisarBoleto(adulterada)).toEqual({ valido: false, erro: "Dígito verificador do bloco 2 não confere" });
  });

  it("identificador 7/9 é moeda de referência: sem valor em reais", () => {
    const codigo = montarArrecadacao("817" + "00000099999" + "1234" + "0".repeat(25));
    expect(analisarBoleto(codigo)).toMatchObject({ valido: true, valorCentavos: null });
  });

  it("rejeita tamanho, letras, moeda e identificador inválidos", () => {
    expect(analisarBoleto("123")).toMatchObject({ valido: false, erro: expect.stringContaining("Tamanho inválido") });
    expect(analisarBoleto("0019A")).toMatchObject({ valido: false, erro: "O código deve conter apenas números" });
    expect(analisarBoleto("845" + "0".repeat(41))).toMatchObject({ valido: false, erro: expect.stringContaining("Identificador") });
    const semReal = "0018" + "0".repeat(40);
    expect(analisarBoleto(semReal)).toMatchObject({ valido: false, erro: expect.stringContaining("moeda") });
    expect(validarBoleto("00190500954014481606906809350314337370000000100")).toBe(true);
    expect(() => montarCodigoBarrasBancario({ banco: "1", vencimento: null, valorCentavos: 1, campoLivre: "" })).toThrow();
  });
});
