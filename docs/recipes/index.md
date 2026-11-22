# Receitas

Cada receita aqui parte de uma **situação real**: uma tela que um app de produção
precisa ter, com os estados que ela tem de verdade (carregando, vazio, erro,
sucesso, celular). Em vez de mostrar um componente isolado, a receita junta as
peças do `tempest-react-sdk` que resolvem aquela tela e mostra o código **arquivo
por arquivo**, completo, com os imports. Você copia, cola e adapta. 🚀

!!! tip "Por onde começar"
    - **Nunca usou o SDK?** Siga o **[Tutorial](../tutorial/index.md)** primeiro:
      ele constrói um conceito por página, e as receitas assumem o que ele ensina.
    - **Precisa de uma tela parecida com a sua?** Escolha um
      [caso de uso](#casos-de-uso) abaixo.
    - **Quer ver tudo junto num app inteiro?** Vá direto ao
      [exemplo integrado](#exemplo-integrado).
    - **Só uma peça pontual** (dark mode, ⌘K, formulário com zod)? As
      [receitas rápidas](#receitas-rapidas) são curtas.

!!! info "Pré-requisitos comuns"
    Todas as receitas assumem um app criado pelo
    [`create-tempest-app`](../scaffold.md), ou um app Vite + React + TS com o SDK
    instalado e o CSS importado uma vez no entrypoint
    ([Instalação manual](../index.md#instalacao-manual)). Quando a receita fala com
    um backend, o contrato é o de um serviço FastAPI sobre o `tempest-fastapi-sdk`,
    descrito em [Integração FastAPI](../integration-fastapi.md).

## Como cada receita é escrita

Toda página segue o mesmo caminho, para você saber onde procurar:

1. **A situação** — quem usa a tela e o que ela precisa fazer.
2. **O que vamos construir** — a lista de comportamentos, incluindo os estados de
   erro e de tela pequena.
3. **O código, arquivo por arquivo** — cada bloco é um arquivo inteiro, com o
   caminho na primeira linha. Todo bloco com `import` é **compilado contra o SDK**
   na suíte de testes do pacote, então o exemplo não fica para trás quando a API
   muda.
4. **Pedaço por pedaço** — por que cada peça está ali.
5. **Recap** — o que levar para o seu app.

## Casos de uso

| Receita | A situação | Peças principais |
| --- | --- | --- |
| [Painel CRUD (admin)](admin-crud.md) | O back-office de uma loja: listar, buscar, filtrar, criar, editar e excluir registros. | tabela paginada no servidor, formulário com zod, overlay, toast, cliente HTTP e query |
| [Cadastro BR + checkout](br-signup-checkout.md) | O cliente se cadastra com CPF, CEP e telefone e paga com Pix ou cartão. | inputs BR, `MoneyInput`, consulta de CEP, checkout Pix e cartão |
| [Viagem ao vivo (mapa + WebSocket)](live-trip.md) | O motorista e o passageiro acompanham a viagem no mapa, em tempo real. | `LiveRouteMap`, `LiveRouteMapLegend`, WebSocket, encaixe na rua |
| [Mensageiro em tempo real](messenger.md) | Um chat de atendimento com histórico, anexos e mensagens que chegam ao vivo. | componentes de conversa, WebSocket, envio otimista, upload |
| [App de campo offline](field-app-offline.md) | Um técnico registra visitas sem sinal e sincroniza quando a rede volta. | fila offline, captura de foto, upload resumível, exportação em zip |

## Exemplo integrado

[**App de gestão**](example-management-app.md): um app pequeno e inteiro, com
login, rotas protegidas por papel, layout com navegação, dashboard com gráficos,
um módulo de cadastro e tela de configurações. É o lugar para ver como as peças
das receitas acima se encaixam num projeto só, da árvore de pastas ao último
arquivo.

## Receitas rápidas

Respostas curtas para um "eu quero fazer X". Eram as seções do antigo
[Cookbook](../cookbook.md), agora uma por página:

- [Fluxo de autenticação completo](auth-flow.md)
- [Lista paginada com busca e ordenação](search-list.md)
- [Formulário com validação zod](zod-form.md)
- [Dark mode sem flash](dark-mode.md)
- [Offline-first](offline-first.md)
- [Paleta de comandos ⌘K](command-palette.md)
- [App do zero em 1 minuto](app-from-scratch.md)

## Full-stack com FastAPI

Duas receitas atravessam o frontend e o backend juntos:

- [Integração FastAPI (full-stack)](../integration-fastapi.md): erros tipados,
  `X-Request-ID`, `Retry-After`, paginação e autenticação de ponta a ponta.
- [Offline Sync (FastAPI)](../offline-sync.md): a fila offline do SDK falando com
  o endpoint de sincronização do backend.

## Recap

- Receita = **uma tela real**, com todos os estados, código completo arquivo por
  arquivo.
- Os exemplos **compilam contra o SDK** na suíte do pacote.
- Comece pelo [Tutorial](../tutorial/index.md), escolha o caso de uso mais parecido
  com o seu e use o [exemplo integrado](example-management-app.md) como mapa do
  app inteiro.
