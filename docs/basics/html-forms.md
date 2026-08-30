# Formulário e acessibilidade

!!! tip "Pule esta página se você já sabe…"

    - por que `<label for>` precisa casar com o `id` do campo;
    - a diferença entre `name`, `id` e `value`;
    - o que `required`, `type` e `aria-invalid` fazem sem uma linha de JS;
    - por que `aria-label` é o **último** recurso, não o primeiro.

## O problema

Este campo parece certo:

```html
<div>Email</div>
<input type="text" />
```

O texto "Email" está ali, você lê na tela. Mas para o browser aquilo são duas
coisas sem relação nenhuma:

- clicar no texto **não** foca o campo;
- o leitor de tela anuncia "caixa de edição, em branco" — sem nome;
- em um formulário com seis campos assim, todos se anunciam igual.

O conserto não é `aria-label`. É a relação que faltava:

```html
<label for="email">Email</label>
<input id="email" name="email" type="email" required />
```

## Um formulário completo

Arquivo inteiro, sem JS nenhum. Abra no browser e tente enviar vazio — o browser
já valida:

```html
<!doctype html>
<html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <title>Cadastro</title>
    </head>
    <body>
        <main>
            <h1>Criar conta</h1>

            <form action="/signup" method="post">
                <p>
                    <label for="email">Email</label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autocomplete="email"
                        aria-describedby="email-hint"
                    />
                    <small id="email-hint">Usamos só para o login.</small>
                </p>

                <p>
                    <label for="senha">Senha</label>
                    <input
                        id="senha"
                        name="senha"
                        type="password"
                        required
                        minlength="8"
                        autocomplete="new-password"
                    />
                </p>

                <p>
                    <label for="plano">Plano</label>
                    <select id="plano" name="plano">
                        <option value="free">Grátis</option>
                        <option value="pro">Pro</option>
                    </select>
                </p>

                <button type="submit">Criar conta</button>
            </form>
        </main>
    </body>
</html>
```

### Pedaço por pedaço

| Atributo                 | O que ele compra                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `for` + `id`             | A **relação** entre rótulo e campo. Clicar no rótulo foca o campo; o leitor de tela anuncia "Email, caixa de edição". |
| `name`                   | A **chave** enviada no submit. É o nome do dado, não o do elemento — `id` é o do elemento.                      |
| `type="email"`           | Teclado com `@` no celular, e validação nativa de formato.                                                     |
| `required`               | Bloqueia o submit e mostra a mensagem do browser, sem JS.                                                       |
| `minlength="8"`          | Mesma coisa para tamanho mínimo.                                                                                |
| `autocomplete`           | Deixa o gerenciador de senhas preencher e **salvar**. `new-password` sugere uma senha forte.                    |
| `aria-describedby`       | Amarra a dica ao campo, então ela é lida **junto** com o rótulo, não como texto solto.                          |

!!! warning "`id` é único na página inteira"

    Dois campos com `id="email"` fazem o `for` apontar para o primeiro, sempre.
    Em React isso acontece o tempo todo quando o mesmo formulário é renderizado
    duas vezes na tela — é exatamente o problema que o `useId()` resolve, e é o
    que o `<Input>` do SDK usa por baixo.

## A ordem de precedência do nome acessível

Todo controle tem um **nome acessível**, e o browser o resolve por uma ordem fixa.
Simplificada, e na prática é o que importa:

1. `aria-labelledby` (aponta para o `id` de outro elemento)
2. `aria-label` (uma string escrita à mão)
3. `<label for>` associado
4. `placeholder`, `title` — e aí você já está no fundo do poço

O `aria-label` **ganha** do `<label>`. Isso é o que o faz útil e é também o que o
faz perigoso: se você escrever os dois e eles divergirem, o usuário de leitor de
tela ouve um nome e o usuário que enxerga lê outro. Um usuário de comando de voz
que fala "clicar em Email" não acha o campo cujo `aria-label` diz outra coisa.

!!! danger "`placeholder` não é rótulo"

    Ele some quando você digita. Um formulário rotulado só por `placeholder` fica
    sem nenhum rótulo exatamente no momento em que o usuário revisa o que
    preencheu — e o contraste dele costuma reprovar em 4,5:1.

## Onde isso aparece no SDK

O `<Input>` do `tempest-react-sdk` monta essa relação inteira sozinho:

```tsx
import { Input } from "tempest-react-sdk";

export function EmailField() {
    return <Input label="Email" type="email" required helperText="Usamos só para o login." />;
}
```

Sem você passar `id`, ele gera um com `useId()`, usa esse valor no `htmlFor` do
`<label>` e no `id` do `<input>`, e ainda liga o texto de ajuda por
`aria-describedby` (que vira `aria-describedby` do erro quando há erro, com
`aria-invalid` junto).

O `<FormField>` é a camada acima: ele lê o estado do `react-hook-form` e injeta
`value`, `onChange`, `onBlur`, `error`, `required` e `aria-invalid` no campo filho.
Você declara a validação uma vez no schema zod, e o markup acessível sai de graça —
veja [Forms (zod)](../forms.md).

### O caso em que `aria-label` é a resposta certa

O `<Slider>` aceita `aria-label` de propósito:

```tsx
import { Slider } from "tempest-react-sdk";

export function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return <Slider aria-label="Volume da chamada" value={value} onChange={onChange} min={0} max={100} />;
}
```

Um slider num rodapé de uma linha, numa célula de tabela ou numa toolbar não tem
espaço para a linha de rótulo acima da trilha. Sem `aria-label`, **todos** eles se
anunciam como "Slider" e ficam indistinguíveis. Essa é a regra: `aria-label` é para
quando o rótulo visível **não cabe** — não para quando você não quis escrevê-lo.

## Recap

- `<label for>` + `id` é a relação que faz o rótulo existir para o browser. ✅
- `name` é a chave do dado enviado; `id` é a identidade do elemento na página.
- `type`, `required`, `minlength` e `autocomplete` compram validação, teclado e
  gerenciador de senha **sem uma linha de JS**.
- `aria-label` ganha do `<label>` — use quando o rótulo visível não cabe, e nunca
  divergindo do texto visível.
- `placeholder` não é rótulo: ele some na hora em que o usuário mais precisa dele.
- No SDK, `<Input>` gera o `id` com `useId()` e amarra tudo; `<FormField>` traz o
  estado de validação para dentro do campo.

📚 **Referência canônica:** [MDN — Formulários](https://developer.mozilla.org/pt-BR/docs/Learn/Forms)

➡️ **Próxima página:** [CSS: seletor, cascata, especificidade](css.md)
