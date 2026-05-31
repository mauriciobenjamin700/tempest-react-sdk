# Web Share

A wrapper over `navigator.share` with a uniform result. It lets you render a
custom fallback (copy-link, social buttons) when the browser does not support
it.

## Usage

```ts
import { share, isShareSupported } from "tempest-react-sdk";

async function shareEvent() {
  const result = await share({
    title: "Tempest",
    text: "Check out this event",
    url: window.location.href,
  });

  if (result.unsupported) {
    copyLinkInstead();
  } else if (result.cancelled) {
    // user closed the sheet — silent
  } else if (result.shared) {
    toast.success("Shared");
  }
}
```

| Field         | Meaning                                      |
| ------------- | -------------------------------------------- |
| `shared`      | `navigator.share` resolved OK                |
| `unsupported` | API missing or payload (files) not supported |
| `cancelled`   | User closed the sheet (`AbortError`)         |
| `error`       | Other errors — capture for telemetry         |

## Files

```ts
await share({ title: "Image", files: [imageFile] });
```

`canShare({ files })` is checked beforehand — it returns `unsupported: true` in
browsers that do not allow files (old iOS, Firefox desktop).

## See also

- [Hooks](./hooks.md) — `useClipboard` for the "copy link" fallback
