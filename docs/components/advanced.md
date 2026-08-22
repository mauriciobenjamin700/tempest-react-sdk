# Overlays & avançados

Componentes em paridade com a shadcn/ui, agrupados por para o que servem. Cada página é autocontida: propósito, exemplo executável, tabela de props e recap. Todos importados de `tempest-react-sdk`.

- **[Avançados: essenciais](advanced-essentials.md)** — Toggles, label, regiões expansíveis, menus disparados por interação e a paleta de comandos. A fatia que quase toda tela usa em algum momento.
- **[Avançados: layout & UX](advanced-layout.md)** — Rolagem estilizada, painéis redimensionáveis, calendário e agenda. Dão forma ao espaço em volta do conteúdo, sem dependência externa.
- **[Avançados: navegação & conteúdo](advanced-navigation.md)** — Navegação com dropdowns, barra de menus e carrossel. Três formas de levar a pessoa a outro lugar, ou de mostrar mais do que cabe na tela.
- **[Avançados: dados](advanced-data.md)** — Tabela stateful, assistente em passos, markdown, mural, tour guiado, transferência entre listas, barra de filtros e kanban. Cada um resolve uma tela inteira.
- **[Avançados: conversa](advanced-chat.md)** — `Chat` para thread entre pessoas e `AIChat` para conversa com um modelo. São componentes diferentes, não variantes — e é por isso que têm página própria.

!!! info "Por que cinco páginas"
    Isto era um arquivo de 1376 linhas. Quem chegava pelo `FilterBar` rolava 450 linhas de outra coisa antes. Os grupos são os que o recap da página original já nomeava — inclusive conversa, que ele descrevia como categoria própria: “`Chat` … e `AIChat` … São componentes diferentes, não variantes.”
