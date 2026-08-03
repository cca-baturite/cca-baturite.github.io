# Manutenção do Portal de Guias da CCA

Checklist para manter o site coerente ao longo do tempo.

## Quando o SEI mudar uma tela ou fluxo

Atualizar **as quatro páginas juntas** (nunca só uma):

1. `guias/sei-abrir-solicitacao-celular.html`
2. `guias/sei-abrir-solicitacao-computador.html`
3. `guias/sei-resumo-visual-celular.html`
4. `guias/sei-resumo-visual-computador.html`

Se a mudança afetar cadastro ou senha, conferir também:
- `guias/sei-cadastro-inicial.html`
- `guias/sei-recuperacao-de-senha.html`
- `guias/sei-reajuste-matricula.html` (usa as mesmas telas de peticionamento)

## Quando o Q-Acadêmico mudar (emissão de documentos)

Família de páginas com CSS compartilhado em `guias/assets/q-academico/documentos.css`:
- `guias/q-academico-documentos.html` (hub)
- `guias/q-academico-documentos-aluno.html`
- `guias/q-academico-aguardando-colacao.html`
- `guias/q-academico-egresso-tecnico.html`
- `guias/q-academico-egresso-superior.html`
- `guias/q-academico-especializacao.html`

Mudanças de layout/estilo dessa família: editar apenas o CSS compartilhado.

## Quando o SUAP/e-mail institucional mudar

- `guias/suapedu-primeiro-acesso.html`
- `guias/suapedu-principais-funcoes.html`
- `guias/suapedu-email-institucional.html`
- `guias/suapedu-email-celular.html`
- `guias/suapedu-email-senha.html`

## A cada semestre (início do período letivo)

- [ ] Atualizar/remover o destaque temporário do Reajuste na `guias/index.html`
      (bloco `.temporary-reajuste-highlight` — há comentário no CSS indicando o trecho).
- [ ] Conferir as datas citadas em `guias/sei-reajuste-matricula.html`.
- [ ] Revisar os links dos formulários (bit.ly) — testar se ainda apontam para o destino certo.
- [ ] Atualizar a linha "Última atualização: ..." no rodapé e nas notas das páginas alteradas.

## Ao adicionar página ou solicitação nova

- [ ] Incluir uma entrada em `guias/assets/busca.json` (título, url, sistema, descrição
      e palavras-chave em linguagem de estudante — inclua sinônimos e erros comuns).
- [ ] Se for uma solicitação nova em `sei-solicitacoes-disponiveis.html`, dar um `id`
      ao `<h3>` para permitir link direto da busca.

## Ao alterar qualquer página

- [ ] A data de "Última atualização" da página foi atualizada?
- [ ] As imagens novas têm `alt`, `loading="lazy"` e `width`/`height`?
- [ ] Testou no celular (Firefox e Chrome)?
- [ ] Os links internos continuam funcionando?

## Estatísticas de acesso

Painel do GoatCounter: https://cca-baturite.goatcounter.com
(login com a conta criada pela CCA — ver instruções no histórico do repositório).
