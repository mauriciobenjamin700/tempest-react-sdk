# Web Share

Wrapper sobre `navigator.share` com resultado uniforme. Permite renderizar fallback custom (copy-link, social buttons) quando o browser não suporta.

## Uso

```ts
import { share, isShareSupported } from "tempest-react-sdk";

async function shareEvent() {
  const result = await share({
    title: "Tempest",
    text: "Confira esse evento",
    url: window.location.href,
  });

  if (result.unsupported) {
    copyLinkInstead();
  } else if (result.cancelled) {
    // usuário fechou o sheet — silencioso
  } else if (result.shared) {
    toast.success("Compartilhado");
  }
}
```

| Campo         | Significado                                     |
| ------------- | ----------------------------------------------- |
| `shared`      | `navigator.share` resolveu OK                   |
| `unsupported` | API ausente ou payload (arquivos) não suportado |
| `cancelled`   | Usuário fechou o sheet (`AbortError`)           |
| `error`       | Outros erros — capture pra telemetria           |

## Arquivos

```ts
await share({ title: "Imagem", files: [imageFile] });
```

`canShare({ files })` é checado antes — retorna `unsupported: true` em browsers que não permitem files (iOS antigo, Firefox desktop).

## Veja também

- [Hooks](./hooks.md) — `useClipboard` para fallback "copy link"
