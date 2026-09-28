# HS Relatórios: app de relatórios técnicos (PWA)

App instalável no celular para registrar **horas, suporte remoto, deslocamentos, km e despesas com foto da nota** por cliente e gerar **relatórios em PDF** (diário, do atendimento e por período) e **planilha CSV** (Excel).

Funciona **100% offline**. Os dados ficam **somente no seu celular**.

## Como colocar no celular

O PWA precisa estar em um endereço **https** para ser instalado. A forma mais fácil e gratuita:

1. Acesse **https://app.netlify.com/drop** no computador.
2. Arraste **esta pasta inteira** (`Relatorios e Horas`) para a página.
3. O Netlify gera um link (ex.: `https://nome-aleatorio.netlify.app`). Crie uma conta grátis para o link não expirar.
4. Abra o link no **Chrome do celular** e toque em **⋮ → Instalar app** (ou "Adicionar à tela inicial").
5. Pronto: o ícone **HS Relatórios** aparece na tela inicial e funciona sem internet.

> Os dados **não** ficam no Netlify. O site entrega só o app; tudo que você lança fica gravado no celular.

## Primeiro uso

1. **Ajustes**: seus dados, logotipo e PIX/banco, que saem no relatório.
2. **Clientes → +**: cadastre o cliente e as regras de cobrança:
   - valor da hora, jornada, % de hora extra e de fim de semana/feriado;
   - **suporte remoto**: valor/hora, cobrança mínima e arredondamento;
   - **hora de deslocamento**: valor/hora e em quais meios cobrar (ônibus, avião, carro);
   - valor do km, despesas reembolsáveis, teto de alimentação e se o cliente paga passagem/hotel.
3. **Atendimentos → +**: crie a viagem, o atendimento local ou o suporte remoto (um por mês, por exemplo).
4. Lance **Horas / Despesa / Km** pelos botões da tela inicial ou use o **cronômetro**.

## Relatórios em PDF

Toque em **📄 Relatório completo** ou **📄 Dia** → **Salvar PDF / Imprimir** → escolha **"Salvar como PDF"** na impressora do Android. O PDF inclui o resumo financeiro, o detalhamento dia a dia, a assinatura do cliente e as fotos das notas como anexos.

## Backup

**Ajustes → Fazer backup** gera um arquivo `.json` com tudo, fotos incluídas. Guarde no Drive, e-mail ou WhatsApp.
Para restaurar (ou passar para outro celular): **Ajustes → Restaurar** e selecione o arquivo.

⚠️ Se você desinstalar o app ou limpar os dados do Chrome, os lançamentos são apagados. **Faça backup com frequência.**

## Atualizar o app

Depois de alterar arquivos, arraste a pasta de novo no Netlify (em "Deploys" do mesmo site) e mude o número em `sw.js` (`relatorios-campo-v2` → `v3`). O celular pega a versão nova na próxima abertura com internet.

## Testar no computador

```bash
python -m http.server 5500
```
Depois abra http://localhost:5500
