# Web Share

`share()` é um wrapper sobre a Web Share API (`navigator.share`) que devolve um **resultado uniforme** em vez de lançar exceções. Você decide o que fazer em cada caso — incluindo um fallback custom (copiar link, botões sociais) quando o browser não suporta.

!!! info "Por que envolver `navigator.share`?"
A API nativa rejeita a promise tanto quando o usuário cancela o diálogo quanto em erros reais, e nem todo browser a expõe. Tratar isso manualmente vira um `try/catch` cheio de checagens em cada call site. `share()` colapsa tudo num objeto `ShareResult` com booleanos claros (`shared` / `unsupported` / `cancelled`), então o seu código vira um `if` simples.

## Uso

```ts
import { share } from "tempest-react-sdk";

async function shareEvent() {
  const result = await share({
    title: "Tempest",
    text: "Confira esse evento",
    url: window.location.href,
  });

  if (result.unsupported) {
    copyLinkInstead(); // fallback: copiar o link
  } else if (result.cancelled) {
    // usuário fechou o sheet — silencioso, não faça nada
  } else if (result.shared) {
    toast.success("Compartilhado");
  } else if (result.error) {
    reportError(result.error); // erro real — mande pra telemetria
  }
}

declare function copyLinkInstead(): void;
declare function reportError(error: unknown): void;
declare const toast: { success: (message: string) => void };
```

### O payload (`SharePayload`)

Todos os campos são opcionais — passe os que fizerem sentido:

| Campo   | Tipo     | Descrição                                           |
| ------- | -------- | --------------------------------------------------- |
| `title` | `string` | Título do conteúdo                                  |
| `text`  | `string` | Texto/descrição                                     |
| `url`   | `string` | URL a compartilhar                                  |
| `files` | `File[]` | Arquivos (suportado só num subconjunto de browsers) |

### O resultado (`ShareResult`)

| Campo         | Tipo      | Significado                                          |
| ------------- | --------- | ---------------------------------------------------- |
| `shared`      | `boolean` | `navigator.share` resolveu OK                        |
| `unsupported` | `boolean` | API ausente, ou o payload (arquivos) não é suportado |
| `cancelled`   | `boolean` | Usuário fechou o sheet (`AbortError`)                |
| `error`       | `unknown` | Outro erro — capture para telemetria                 |

!!! tip "`cancelled` não é erro"
Quando o usuário fecha o sheet de compartilhamento, isso vem como `cancelled: true`, **não** em `error`. Trate como um no-op silencioso — mostrar um toast de erro aqui irrita o usuário.

## Detectando suporte antecipadamente

Use `isShareSupported()` para decidir se mostra o botão "Compartilhar" ou já parte para o fallback, sem esperar o clique:

```tsx
import { isShareSupported, share } from "tempest-react-sdk";

export function ShareButton({ url }: { url: string }) {
  if (!isShareSupported()) {
    return <CopyLinkButton url={url} />;
  }

  return <button onClick={() => share({ title: "Tempest", url })}>Compartilhar</button>;
}

declare function CopyLinkButton(props: { url: string }): JSX.Element;
```

## Compartilhando arquivos

Passe `files` para compartilhar imagens, PDFs, etc. `share()` chama `navigator.canShare({ files })` **antes** de tentar — se o browser não permite arquivos (iOS antigo, Firefox desktop), você recebe `unsupported: true` em vez de uma exceção:

```ts
import { share } from "tempest-react-sdk";

async function shareImage(imageFile: File) {
  const result = await share({ title: "Imagem", files: [imageFile] });
  if (result.unsupported) {
    // este browser não compartilha arquivos — ofereça download
    downloadFile(imageFile);
  }
}

declare function downloadFile(file: File): void;
```

!!! warning "Web Share API exige HTTPS e gesto do usuário"
`navigator.share` só funciona em contexto seguro (HTTPS ou `localhost`) e precisa ser chamado dentro de um handler de gesto do usuário (ex.: `onClick`). Chamar fora de um clique faz o browser rejeitar — o que cai em `error`, não em `unsupported`.

## Recap

- `share(payload)` envolve `navigator.share` e devolve `ShareResult` em vez de lançar.
- Cheque na ordem: `unsupported` → fallback, `cancelled` → silêncio, `shared` → sucesso, `error` → telemetria.
- `SharePayload` aceita `title`, `text`, `url`, `files` (todos opcionais).
- `isShareSupported()` decide antecipadamente entre o botão nativo e o fallback.
- `files` é validado via `canShare` antes de tentar; browsers sem suporte devolvem `unsupported: true`.
- Requer HTTPS e um gesto do usuário (chame de um `onClick`).

## Veja também

- [Hooks](./hooks.md) — `useClipboard` para o fallback "copiar link"
