# Avançados: layout & UX

Rolagem estilizada, painéis redimensionáveis, calendário e agenda. Dão forma ao espaço em volta do conteúdo, sem dependência externa.

## `ScrollArea`

Contêiner de rolagem estilizado que transborda no eixo escolhido e renderiza uma barra de rolagem fina (WebKit). Repassa `className`, `style` e `ref` ao `<div>`.

```tsx
import { ScrollArea } from "tempest-react-sdk";

<ScrollArea maxHeight={240} orientation="vertical">
  <ul>
    {items.map((item) => (
      <li key={item.id}>{item.name}</li>
    ))}
  </ul>
</ScrollArea>;
```

| Prop          | Tipo                                   | Default      | Descrição                             |
| ------------- | -------------------------------------- | ------------ | ------------------------------------- |
| `maxHeight`   | `number \| string`                     | —            | Limita a altura; números viram pixels |
| `orientation` | `"vertical" \| "horizontal" \| "both"` | `"vertical"`   | Qual eixo rola                        |
| `scrollLabel` | `string`                               | `"Área rolável"` | Nome acessível da região rolável    |

Demais props de `<div>` são repassadas.

!!! info "Enquanto transborda, vira um grupo focável"
    Uma área cujo conteúdo é texto puro não tem nada focável dentro. Sem um ponto de tabulação próprio, quem navega por teclado vê a barra de rolagem e não tem como movê-la — o foco nunca pousa onde as setas rolariam. Por isso a área recebe `tabIndex={0}` + `role="group"` + `aria-label` **só enquanto o conteúdo de fato transborda**, e o perde de volta quando cabe. Uma área que não rola nunca adiciona parada de tab. `role` e `tabIndex` passados pelo chamador continuam vencendo.

## `Resizable`

Layout de dois painéis com divisor arrastável. O primeiro painel é dimensionado via `flex-basis` em porcentagem; o segundo preenche o resto. Arraste com o ponteiro ou foque o divisor e use as setas (passo de 2%).

```tsx
import { Resizable } from "tempest-react-sdk";

<Resizable direction="horizontal" defaultSize={40} min={20} max={80}>
  <aside>Painel lateral</aside>
  <main>Conteúdo principal</main>
</Resizable>;
```

| Prop          | Tipo                         | Default        | Descrição                                          |
| ------------- | ---------------------------- | -------------- | -------------------------------------------------- |
| `direction`   | `"horizontal" \| "vertical"` | `"horizontal"` | `horizontal` coloca os painéis lado a lado         |
| `defaultSize` | `number` (%)                 | `50`           | Tamanho inicial do primeiro painel, em porcentagem |
| `min`         | `number` (%)                 | `10`           | Clamp inferior do primeiro painel                  |
| `max`         | `number` (%)                 | `90`           | Clamp superior do primeiro painel                  |
| `children`    | `[ReactNode, ReactNode]`     | —              | Exatamente dois painéis — `[paneA, paneB]`         |

!!! warning "Exatamente dois filhos"
    `children` é uma tupla `[ReactNode, ReactNode]`. O tamanho é sempre fixado em `[min, max]`.

## `Calendar`

Seletor de data em grade mensal. Cabeçalho com mês/ano + botões prev/next, linha de dias da semana e grade 6×7 de botões de dia. Seleção e mês visível controláveis ou não-controlados. Aritmética com `Date` puro — sem bibliotecas externas.

```tsx
import { Calendar } from "tempest-react-sdk";
import { useState } from "react";

const [date, setDate] = useState<Date>();

<Calendar value={date} onChange={setDate} weekStartsOn={1} minDate={new Date(2026, 0, 1)} />;
```

| Prop            | Tipo                    | Default | Descrição                                         |
| --------------- | ----------------------- | ------- | ------------------------------------------------- |
| `value`         | `Date`                  | —       | Data selecionada controlada                       |
| `defaultValue`  | `Date`                  | —       | Data inicial no caso não-controlado               |
| `onChange`      | `(date: Date) => void`  | —       | Chamado com a nova data selecionada               |
| `month`         | `Date`                  | —       | Mês visível controlado (qualquer dia dentro dele) |
| `onMonthChange` | `(month: Date) => void` | —       | Chamado quando o mês visível muda (prev/next)     |
| `minDate`       | `Date`                  | —       | Data mínima selecionável (inclusiva)              |
| `maxDate`       | `Date`                  | —       | Data máxima selecionável (inclusiva)              |
| `weekStartsOn`  | `0 \| 1`                | `0`     | Primeira coluna — `0` domingo, `1` segunda        |

!!! tip "Teclado"
    Setas movem o foco por dia (←/→) ou por semana (↑/↓); Enter/Espaço seleciona o dia focado.

## `Scheduler`

Agenda: eventos posicionados numa grade de tempo ao longo de dias consecutivos. O `Calendar` acima é um **seletor de data** — responde "qual dia?". Este responde "o que tem nesses dias, e quando", o que exige estrutura diferente: eixo vertical de tempo, evento dimensionado pela duração e eventos sobrepostos lado a lado.

```tsx
import { Scheduler, type SchedulerEvent } from "tempest-react-sdk";

const events: SchedulerEvent[] = [
  { id: "1", title: "Daily", start: new Date(2026, 6, 27, 9, 0), end: new Date(2026, 6, 27, 9, 15) },
  { id: "2", title: "Cliente", start: new Date(2026, 6, 27, 9, 0), end: new Date(2026, 6, 27, 10, 30) },
  { id: "3", title: "Feriado", start: new Date(2026, 6, 29), end: new Date(2026, 6, 30), allDay: true },
];

<Scheduler
  events={events}
  days={7}
  startHour={7}
  endHour={21}
  onEventClick={(event) => abrir(event.id)}
  onSlotClick={(start) => criarEm(start)}
/>;
```

| Prop              | Tipo                                    | Default   | Descrição                                              |
| ----------------- | --------------------------------------- | --------- | ------------------------------------------------------ |
| `events`          | `SchedulerEvent[]`                      | —         | Eventos; instantes lidos no fuso local                 |
| `anchor`          | `Date`                                  | hoje      | Qualquer dia dentro do intervalo a mostrar             |
| `days`            | `number`                                | `7`       | Dias consecutivos — `1` é visão de dia                 |
| `startHour`       | `number`                                | `8`       | Primeira hora visível                                  |
| `endHour`         | `number`                                | `20`      | Última hora visível                                    |
| `snapMinutes`     | `number`                                | `30`      | Granularidade do clique em espaço vazio                |
| `onEventClick`    | `(event: SchedulerEvent) => void`       | —         | Evento ativado                                         |
| `onSlotClick`     | `(start: Date) => void`                 | —         | Clique em espaço vazio, já snapado                     |
| `renderEvent`     | `(event: SchedulerEvent) => ReactNode`  | —         | Conteúdo do evento                                     |
| `locale`          | `string`                                | `"pt-BR"` | Rótulos de dia e hora                                  |
| `showCurrentTime` | `boolean`                               | `true`    | Linha de agora                                         |
| `now`             | `Date`                                  | relógio   | "Agora" fixo — use em teste e demo pra determinismo     |

Evento: `{ id, title, start, end, allDay?, data? }`.

!!! info "Sobreposição é o que quase toda implementação erra"
    Eventos sobrepostos são agrupados em **clusters de sobreposição mútua** — uma
    cadeia onde cada evento sobrepõe ao menos um outro — e **todos no cluster
    compartilham a mesma contagem de colunas**. É isso que faz as larguras baterem;
    atribuir coluna par a par produz o layout esfarrapado onde dois eventos ocupam
    metade cada e um terceiro cobre um deles silenciosamente.

    A coluna é **reaproveitada assim que libera**: `9–10`, `9–10`, `10–11` usa duas
    colunas, não três. E encostar não é sobrepor — `9–10` seguido de `10–11` ficam os
    dois com largura cheia.

    O layout é puro e mora em `scheduler-layout.ts`, com teste próprio.

!!! warning "Horário local, e DST não duplica dia"
    `start`/`end` são instantes lidos no fuso do navegador. O intervalo de dias é
    montado **incrementando o dia do calendário**, não somando 24 h em milissegundos:
    num limite de horário de verão o dia tem 23 ou 25 horas, e a aritmética de
    milissegundo produziria data duplicada ou pulada.

!!! check "Evento cruzando meia-noite aparece nas duas colunas"
    Uma reserva 23:00–01:00 é dividida em dois segmentos, cada um clipado à janela
    visível do seu dia. Sem isso ela ou desaparece ou é desenhada fora da coluna.

!!! note "Dia inteiro tem faixa própria"
    Evento com `allDay` sai numa faixa acima da grade, atravessando os dias que
    cobre — posição vertical não significaria nada pra ele. A faixa não é renderizada
    quando não há nenhum.

!!! tip "Clique em espaço vazio cria; clique no evento não"
    O `onSlotClick` só dispara quando o clique caiu na coluna, não num evento dentro
    dela — o instante vem snapado em `snapMinutes` e clampado à janela.

!!! warning "Não é `role="grid"`"
    Uma grade ARIA exige filhos `row`, e aqui os eventos são **irmãos** das colunas
    dentro de um único CSS grid: um wrapper `row` faria as colunas deixarem de ser
    itens do grid e o layout colapsaria. Cada dia é um `group` rotulado — o leitor de
    tela tabula os botões de evento e o nome do grupo dá o dia. Verificado com `axe`.

## Recap

- **Layout & UX**: `ScrollArea` para rolagem estilizada, `Resizable` para painéis divididos e `Calendar` para seleção de datas sem dependências externas.
- Todos seguem os mesmos padrões controlado/não-controlado, expõem A11y por teclado e importam de `tempest-react-sdk`.
