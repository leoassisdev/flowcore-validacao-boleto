# Validação de Boleto

> Valida linha digitável e código de barras de boleto bancário e de arrecadação, conferindo todos os DVs, e extrai valor e vencimento com o novo fator de 2025. Contas a pagar sem pagamento errado.

**Ver ao vivo, com preview e manual:** https://flowcoresolucoes.com.br/codigos/validacao-boleto

Criado por **FlowCore Soluções LTDA**.

## Arquivos

- [`src/boleto.ts`](src/boleto.ts)
- [`src/boleto.test.ts`](src/boleto.test.ts)

## Como instalar

1. **Funciona onde você já roda** Node 18+, Cloudflare Workers, Deno, Bun, Vercel e Netlify Functions. Zero dependência: só fetch e Web Crypto, que já vêm no runtime.
2. **Crie src/lib/boleto.ts** Copie o conteúdo de `src/boleto.ts` e `src/boleto.test.ts` deste repositório.
3. **Use**

   ```bash
   const r = analisarBoleto("00190.50095 40144.816069 06809.350314 3 37370000000100");
   if (r.valido) {
     console.log(r.tipo, r.valorCentavos, r.vencimento, r.banco);
   }
   ```

4. **Rode o teste junto** O arquivo de teste (`src/boleto.test.ts`) cobre 10 cenários. Copie para src/lib/ ao lado e rode:

   ```bash
   npm install -D vitest
   npx vitest run src/lib
   ```


## Testes

`src/boleto.test.ts` cobre 10 cenários.

```bash
npm install
npm test
```

## Licença

MIT. Pode usar em projeto pessoal ou comercial, de graça. A única condição é manter a linha **“Criado por FlowCore Soluções LTDA”** (ou o crédito de adaptação) onde ela está.

---

Precisa disso integrado no seu sistema? A [FlowCore](https://flowcoresolucoes.com.br) desenvolve sob medida.
