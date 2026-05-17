import { Button, Input, Textarea, useToast, useZodForm } from "tempest-react-sdk";
import { z } from "zod";

const contactSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 letras."),
    email: z.string().email("Email inválido."),
    message: z.string().min(10, "Mensagem muito curta (mínimo 10 caracteres)."),
});

type ContactValues = z.infer<typeof contactSchema>;

export function FormsSection() {
    const toast = useToast();
    const form = useZodForm(contactSchema, {
        defaultValues: { name: "", email: "", message: "" },
    });

    async function onSubmit(values: ContactValues): Promise<void> {
        await new Promise((r) => setTimeout(r, 600));
        toast.success(`Mensagem enviada por ${values.name}`);
        form.reset();
    }

    return (
        <section className="gallery-section" id="forms">
            <h3>useZodForm + react-hook-form</h3>
            <p className="description">
                Schema é a fonte da verdade. Tipo, validação e erros derivam dele.
            </p>

            <form className="gallery-stack" onSubmit={form.handleSubmit(onSubmit)}>
                <Input
                    label="Nome"
                    {...form.register("name")}
                    error={form.formState.errors.name?.message}
                    required
                />
                <Input
                    label="Email"
                    type="email"
                    {...form.register("email")}
                    error={form.formState.errors.email?.message}
                    required
                />
                <Textarea
                    label="Mensagem"
                    rows={4}
                    {...form.register("message")}
                    error={form.formState.errors.message?.message}
                    required
                />
                <Button type="submit" loading={form.formState.isSubmitting}>
                    Enviar
                </Button>
            </form>
        </section>
    );
}
