# Ação

Componentes de **ação** são o ponto onde o usuário dispara algo: clicar, escolher numa lista, confirmar. Eles carregam intenção — um clique muda dados, navega, ou inicia um fluxo. Por isso a categoria reúne tanto o gatilho direto (`Button`) quanto os elementos que cercam uma ação: dica contextual (`Tooltip`), conjunto de ações secundárias (`DropdownMenu`), painel ancorado (`Popover`) e a salvaguarda antes de algo destrutivo (`ConfirmDialog`).

Use esta página quando precisar que o usuário **faça** algo. Para entrada de dados (texto, seleção, datas) veja [inputs](./inputs.md); para apresentar coleções, veja [data](./data.md).

## `Button`

<!-- gallery:buttons -->
[![Buttons na gallery](../assets/gallery/buttons.webp)](../gallery.md)

*Seção `buttons` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: a ação primária ou secundária de qualquer tela — submeter um form, abrir um modal, navegar. É o gatilho de ação por padrão.

Botão primário com variants, sizes, estado de loading.

```tsx
import { Button } from "tempest-react-sdk";
import { Plus, Trash } from "lucide-react";

<Button>Salvar</Button>;
<Button variant="danger" leftIcon={<Trash size={16} />}>
  Excluir
</Button>;
<Button variant="outline" loading>
  Carregando…
</Button>;
<Button variant="link" rightIcon={<ArrowRight size={14} />}>
  Ver mais
</Button>;
<Button iconOnly aria-label="Adicionar">
  <Plus size={16} />
</Button>;
<Button fullWidth pill>
  CTA
</Button>;
```

| Prop        | Tipo                                                                                            | Default     |
| ----------- | ----------------------------------------------------------------------------------------------- | ----------- |
| `variant`   | `"primary" \| "secondary" \| "success" \| "danger" \| "soft" \| "outline" \| "ghost" \| "link"` | `"primary"` |
| `size`      | `"xs" \| "sm" \| "md" \| "lg" \| "xl"`                                                          | `"md"`      |
| `loading`   | `boolean`                                                                                       | `false`     |
| `fullWidth` | `boolean`                                                                                       | `false`     |
| `iconOnly`  | `boolean` (square, requer `aria-label`)                                                         | `false`     |
| `pill`      | `boolean` (border-radius pílula)                                                                | `false`     |
| `leftIcon`  | `ReactNode`                                                                                     | —           |
| `rightIcon` | `ReactNode`                                                                                     | —           |

!!! warning "iconOnly precisa de rótulo acessível"
    `iconOnly` remove o texto visível, então leitores de tela não têm o que anunciar. Sempre passe `aria-label` descrevendo a ação (`aria-label="Excluir"`). Sem isso o botão é um ícone mudo para tecnologia assistiva.

!!! tip "loading bloqueia duplo clique"
    `loading` desabilita o botão e seta `aria-busy="true"` — é o padrão para submits assíncronos. Ative-o assim que disparar a request para evitar requisições duplicadas por cliques repetidos.

## `FloatingActionButton`

<!-- gallery:material -->
[![Material (ListTile · FAB · Rail) na gallery](../assets/gallery/material.webp)](../gallery.md)

*Seção `material` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: a ação primária e persistente de uma tela (criar, compor, adicionar) que deve ficar sempre acessível, flutuando sobre o conteúdo. Redondo quando só tem ícone, ou estendido (pílula) quando tem `label`.

Por padrão fica fixo no canto inferior direito; passe `position="none"` para posicioná-lo inline (ex.: dentro de um `NavigationRail`). Espalha todos os props nativos de `<button>` (`onClick`, `disabled`, etc.).

```tsx
import { FloatingActionButton } from "tempest-react-sdk";
import { Plus } from "lucide-react";

<FloatingActionButton icon={<Plus />} aria-label="Novo" position="none" onClick={create} />;
<FloatingActionButton icon={<Plus />} label="Novo pedido" onClick={create} />;
```

| Prop       | Tipo                                       | Default          |
| ---------- | ------------------------------------------ | ---------------- |
| `icon`     | `ReactNode`                                | —                |
| `label`    | `ReactNode` (presente → FAB estendido)     | —                |
| `position` | `"bottom-right" \| "bottom-left" \| "none"` | `"bottom-right"` |
| `size`     | `"sm" \| "md" \| "lg"`                     | `"md"`           |
| `variant`  | `"primary" \| "surface"`                   | `"primary"`      |
| ...        | Todos os atributos de `HTMLButtonElement`  | —                |

!!! warning "FAB só de ícone precisa de `aria-label`"
    Sem `label` visível, o FAB redondo não tem nome acessível. Sempre passe `aria-label` descrevendo a ação (`aria-label="Novo"`); quando há `label`, ele já serve de nome.

## `Tooltip`

<!-- gallery:navigation -->
[![AppBar · Tabs · Tooltip · Drawer na gallery](../assets/gallery/navigation.webp)](../gallery.md)

*Seção `navigation` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: dar contexto extra a um controle cujo significado não é óbvio — tipicamente botões `iconOnly`. Nunca para informação crítica.

Hover tooltip portalado. Aparece no hover **e** no foco por teclado.

```tsx
import { Button, Tooltip } from "tempest-react-sdk";
import { Trash } from "lucide-react";

export function ExcluirComDica() {
    return (
        <Tooltip content="Excluir permanentemente" placement="bottom" openDelay={300}>
            <Button variant="danger" iconOnly aria-label="Excluir">
                <Trash size={16} />
            </Button>
        </Tooltip>
    );
}
```

| Prop        | Tipo                                     | Default |
| ----------- | ---------------------------------------- | ------- |
| `content`   | `ReactNode`                              | —       |
| `placement` | `"top" \| "right" \| "bottom" \| "left"` | `"top"` |
| `openDelay` | `number` (ms antes de aparecer)          | `150`   |
| `disabled`  | `boolean` (desliga sem mexer no trigger) | `false` |

`Escape` esconde a dica sem mover o ponteiro nem o foco, como pede o WCAG 2.2
SC 1.4.13. Dentro de um `Modal`, o primeiro `Escape` esconde a dica e o segundo
fecha o modal.

!!! warning "Não esconda informação essencial num tooltip"
    Usuários de touch não têm hover — eles nunca verão o conteúdo. Tooltip é reforço, não a única fonte de uma informação necessária para concluir a tarefa.

## `DropdownMenu`

<!-- gallery:overlays -->
[![Popover · Dropdown · HoverCard na gallery](../assets/gallery/overlays.webp)](../gallery.md)

*Seção `overlays` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: agrupar ações secundárias atrás de um único gatilho ("Mais ações", menu de perfil) quando elas não cabem na barra principal.

Menu suspenso de ações. Navegação por teclado (↑↓ Home End Esc). Cada entrada precisa de um `id` estável (usado como key do React).

```tsx
import { Button, DropdownMenu } from "tempest-react-sdk";

export function MaisAcoes({
    navigate,
    logout,
}: {
    navigate: (to: string) => void;
    logout: () => void;
}) {
    return (
        <DropdownMenu
            trigger={<Button variant="ghost">Mais ações</Button>}
            items={[
                { type: "label", id: "h", label: "Conta" },
                {
                    type: "item",
                    id: "edit",
                    label: "Editar perfil",
                    onSelect: () => navigate("/profile"),
                },
                { type: "separator", id: "s1" },
                { type: "item", id: "logout", label: "Sair", onSelect: logout, danger: true },
            ]}
        />
    );
}
```

| Entry type    | Campos                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `"item"`      | `id`, `label`, `icon?`, `onSelect`, `disabled?`, `danger?`             |
| `"checkbox"`  | `id`, `label`, `icon?`, `checked`, `onSelect`, `disabled?`             |
| `"label"`     | `id`, `label`                                                          |
| `"separator"` | `id`                                                                   |

Props do componente: `trigger` (`ReactElement`), `items` (`DropdownMenuEntry[]`), `placement` (`"bottom-start" \| "bottom-end" \| "top-start" \| "top-end"`, default `"bottom-start"`).

### Item que liga e desliga

`type: "checkbox"` renderiza `role="menuitemcheckbox"` com `aria-checked` — que é como um leitor de tela anuncia "marcado" em vez de deixar o estado invisível.

```tsx
import { useState } from "react";
import { Button, DropdownMenu } from "tempest-react-sdk";

export function MenuDaChamada({ alternarTema }: { alternarTema: () => void }) {
    const [silencioso, setSilencioso] = useState(false);

    return (
        <DropdownMenu
            trigger={<Button variant="ghost">Mais opções</Button>}
            items={[
                {
                    type: "checkbox",
                    id: "quiet",
                    label: "Silenciar os sons da chamada",
                    checked: silencioso,
                    onSelect: () => setSilencioso((valor) => !valor),
                },
                { type: "separator", id: "s" },
                { type: "item", id: "tema", label: "Alternar tema", onSelect: alternarTema },
            ]}
        />
    );
}
```

!!! note "Item comum fecha, checkbox não"
    Selecionar um `"item"` dispara `onSelect` e fecha o menu. Um `"checkbox"`
    alterna e **deixa o menu aberto**, porque ajustar duas preferências seguidas é
    o caso comum e fechar após a primeira transformaria a segunda numa segunda
    viagem.

### Teclado

`role="menu"` é uma promessa sobre o teclado, e o componente a cumpre — o padrão
é o [APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/):

| Tecla | No gatilho | No menu aberto |
| --- | --- | --- |
| `Enter` / `Space` | abre e foca o **primeiro** item | ativa o item focado |
| `↓` | abre e foca o **primeiro** item | próximo, com wrap |
| `↑` | abre e foca o **último** item | anterior, com wrap |
| `Home` / `End` | — | primeiro / último |
| `Esc` | — | fecha e **devolve o foco ao gatilho** |
| `Tab` | segue a página | fecha e segue a página |

!!! tip "Foco gerenciado — `Tab` não percorre o menu"
    As entradas têm `tabIndex={-1}` e só a ativa tem `0`. Sem isso, `Tab` andaria
    item a item e faria o papel que a seta deveria fazer — o que é pior que
    inacessível, porque o widget parece funcionar e contradiz o que o
    `role="menu"` anunciou. Entrada desabilitada, `label` e `separator` nunca são
    parada.

## `Popover`

> **Quando usar**: um painel flutuante com conteúdo arbitrário (filtros, mini-form, preview) ancorado a um gatilho — quando você precisa de mais que uma lista de ações.

Painel flutuante genérico (anchor + outside-click + Esc dismiss). Funciona controlado (`open` + `onOpenChange`) ou não-controlado (`defaultOpen`).

```tsx
import { useState } from "react";
import { Button, Checkbox, Popover, Stack } from "tempest-react-sdk";

export function Filtros() {
    const [open, setOpen] = useState(false);

    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            placement="bottom"
            trigger={<Button>Filtros</Button>}
        >
            <Stack gap={3}>
                <Checkbox label="Apenas ativos" />
                <Checkbox label="Pago" />
                <Button onClick={() => setOpen(false)}>Aplicar</Button>
            </Stack>
        </Popover>
    );
}
```

| Prop                  | Tipo                                     | Default        |
| --------------------- | ---------------------------------------- | -------------- |
| `trigger`             | `ReactElement` (clonado com handlers)    | —              |
| `open`                | `boolean`                                | — (controlled) |
| `onOpenChange`        | `(open: boolean) => void`                | —              |
| `defaultOpen`         | `boolean` (uso não-controlado)           | `false`        |
| `placement`           | `"top" \| "bottom" \| "left" \| "right"` | `"bottom"`     |
| `closeOnEsc`          | `boolean`                                | `true`         |
| `closeOnOutsideClick` | `boolean`                                | `true`         |

!!! note "Sem collision detection"
    O `Popover` não reposiciona automaticamente quando esbarra na borda da viewport. Se você precisa de flip/shift automático, prefira o `DropdownMenu` (lista simples) ou integre Floating UI no app.

## `ConfirmDialog`

<!-- gallery:modal -->
[![Modal & Toast na gallery](../assets/gallery/modal.webp)](../gallery.md)

*Seção `modal` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: a última barreira antes de uma ação irreversível ou cara (excluir, sobrescrever, cancelar). Sempre com `variant="danger"` quando destrutiva.

Prompt destrutivo pré-montado em cima do [`Modal`](./overlay.md) (texto + 2 botões).

```tsx
import { useState } from "react";
import { ConfirmDialog } from "tempest-react-sdk";

export function ExcluirUsuario({
    user,
    deleteUser,
}: {
    user: { id: string; name: string };
    deleteUser: (id: string) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    return (
        <ConfirmDialog
            open={open}
            title="Excluir usuário"
            description={`Esta ação é permanente. Excluir ${user.name}?`}
            confirmLabel="Sim, excluir"
            cancelLabel="Cancelar"
            variant="danger"
            loading={deleting}
            onConfirm={async () => {
                setDeleting(true);
                await deleteUser(user.id);
                setDeleting(false);
                setOpen(false);
            }}
            onCancel={() => setOpen(false)}
        />
    );
}
```

| Prop           | Tipo                                                    | Default       |
| -------------- | ------------------------------------------------------- | ------------- |
| `open`         | `boolean`                                               | —             |
| `title`        | `ReactNode`                                             | —             |
| `description`  | `ReactNode`                                             | —             |
| `confirmLabel` | `string`                                                | `"Confirmar"` |
| `cancelLabel`  | `string`                                                | `"Cancelar"`  |
| `variant`      | `"primary" \| "danger"`                                 | `"primary"`   |
| `loading`      | `boolean` (mostra spinner + desabilita ambos os botões) | `false`       |
| `onConfirm`    | `() => void \| Promise<void>`                           | —             |
| `onCancel`     | `() => void`                                            | —             |

!!! tip "Controle o loading durante a request"
    `onConfirm` aceita uma promise, mas o `ConfirmDialog` não gerencia o estado de loading sozinho — passe `loading={deleting}` controlado pelo seu estado para travar ambos os botões enquanto a ação assíncrona corre.

## `InstallButton`

<!-- gallery:pwa -->
[![PWA: Install · Push na gallery](../assets/gallery/pwa.webp)](../gallery.md)

*Seção `pwa` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

Botão de instalação do PWA, ligado a [`useInstallPrompt`](../hooks.md). Onde o navegador dispara `beforeinstallprompt`, o clique instala. Onde **não** dispara — iOS Safari e os forks Chromium de Android (Mi Browser, UC, Opera Mini, Huawei) — o clique revela a instrução daquela plataforma em vez de o botão sumir. Herda todas as props do [`Button`](#button).

```tsx
import { InstallButton } from "tempest-react-sdk";
import { Download } from "lucide-react";

<InstallButton variant="primary" leftIcon={<Download size={18} />} />;
```

| Prop                    | Tipo                                                       | Default            |
| ----------------------- | ---------------------------------------------------------- | ------------------ |
| `label`                 | `ReactNode`                                                | `"Instalar app"`   |
| `hintLabel`             | `ReactNode`                                                | `"Como instalar"`  |
| `onResult`              | `(o: "accepted" \| "dismissed" \| "unsupported") => void`  | —                  |
| `renderHint`            | `(input: InstallHintInput) => ReactNode`                   | `defaultInstallHint` |
| `manualFallbackDelayMs` | `number`                                                   | `3000`             |
| `wrapperClassName`      | `string`                                                   | —                  |
| …                       | todas as props de `Button` (`variant`, `size`, `leftIcon`) | —                  |

!!! danger "Até a v0.65.0 os dois sumiam justamente onde o usuário precisa deles"
    `InstallButton` e `InstallBanner` eram construídos sobre `useBeforeInstallPrompt`, então renderizavam `null` em todo navegador que nunca dispara o evento. iOS Safari é exatamente esse caso — e é onde o caminho de instalação está escondido atrás do menu **Compartilhar**, que ninguém acha sem ser avisado. O resultado prático era cada app manter uma cópia local destes dois componentes só para acrescentar as trilhas `ios` e `manual`.

    `null` agora só sai quando não há nada a oferecer: app já instalado, rodando standalone, ou dentro do período de dispensa.

!!! tip "`renderHint` troca a cópia sem reescrever o componente"
    O default é PT-BR e nomeia as entradas reais de menu — no Android também oferece o link `intent://` que reabre a página no Chrome, que é o único caminho que chega a uma instalação de verdade num fork sem entrada de instalar.

    ```tsx
    import { InstallButton, defaultInstallHint } from "tempest-react-sdk";

    <InstallButton
        renderHint={(input) =>
            input.method === "ios" ? <MeuTutorialIOS /> : defaultInstallHint(input)
        }
    />;
    ```

    `InstallHintInput` traz `method` (`"native" | "ios" | "manual" | "none"`) e `openInChromeIntent`.

## `InstallBanner`

Banner inferior dispensável que convida a instalar o PWA, sobre o mesmo `useInstallPrompt`. Onde o navegador não pode ser promptado, o botão vira **"Como instalar"** e revela a instrução da plataforma dentro do próprio banner. `storageKey` lembra a dispensa entre recarregamentos.

```tsx
import { InstallBanner } from "tempest-react-sdk";

export function Instalar() {
    return (
        <InstallBanner
            title="Instale o app"
            description="Acesso offline e atalho na tela inicial."
            storageKey="meu-app:install-dismissed"
        />
    );
}
```

| Prop           | Tipo                  | Default        |
| -------------- | --------------------- | -------------- |
| `title`        | `ReactNode`           | `"Instale o app"` |
| `description`  | `ReactNode`           | —              |
| `installLabel` | `string`              | `"Instalar"`   |
| `dismissLabel` | `string`              | `"Dispensar"`  |
| `icon`         | `ReactNode`           | —              |
| `hintLabel`    | `string`              | `"Como instalar"` |
| `storageKey`   | `string`              | — (sessão)     |
| `declineCooldownMs` | `number`         | — (dispensa permanente) |
| `renderHint`   | `(input: InstallHintInput) => ReactNode` | `defaultInstallHint` |
| `manualFallbackDelayMs` | `number`     | `3000`         |
| `onResult`     | `(o) => void`         | —              |

!!! note "`declineCooldownMs` muda o que é gravado — e respeita o que já estava lá"
    Sem ele, a dispensa gravada em `storageKey` é **permanente**, que é o que o componente sempre fez (grava `"1"`). Com ele, grava um timestamp e o banner volta depois da janela.

    Uma chave que já contém `"1"` continua valendo como dispensa permanente mesmo com `declineCooldownMs` configurado: ela foi escrita sob o contrato antigo, e ressuscitar um banner que o usuário desligou é pior do que mantê-lo desligado.

## Resumo

| Componente      | Use para                                       | Gatilho    |
| --------------- | ---------------------------------------------- | ---------- |
| `Button`        | Disparar a ação primária/secundária            | clique     |
| `FloatingActionButton` | Ação primária flutuante e persistente   | clique     |
| `InstallButton` | Instalar o PWA, ou ensinar como onde não há prompt | clique  |
| `InstallBanner` | Convite dispensável pra instalar o PWA         | clique     |
| `Tooltip`       | Contexto não-crítico num controle              | hover/foco |
| `DropdownMenu`  | Lista de ações secundárias (fecha ao escolher) | clique     |
| `Popover`       | Painel flutuante com conteúdo arbitrário       | clique     |
| `ConfirmDialog` | Confirmar ação destrutiva antes de executar    | —          |

Pontos-chave de acessibilidade:

- Ações destrutivas devem usar `variant="danger"`.
- `Button.loading` é o padrão para submits async — bloqueia duplos cliques.
- Tooltips não devem conter informação crítica (usuários de touch não veem hover).
- `iconOnly` **exige** `aria-label`.

Relacionados: [overlay](./overlay.md) (`ConfirmDialog` é construído sobre `Modal`) · [inputs](./inputs.md) (entrada de dados) · [feedback](./feedback.md) (toasts/alerts após a ação).
