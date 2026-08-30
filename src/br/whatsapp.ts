/** Country calling code for Brazil, the digits `wa.me` needs in front of a national number. */
const BR_COUNTRY_CODE = "55";

const NATIONAL_LENGTHS = new Set([10, 11]);
const E164_MIN_WITH_COUNTRY_CODE = 12;
const E164_MAX = 15;

/**
 * Normalise a phone number to the digits-only form `wa.me` accepts.
 *
 * A Brazilian number is stored almost everywhere **without** the country code —
 * ten digits for a landline, eleven for a mobile — and `wa.me` refuses anything
 * that is not fully qualified. Those two shapes get `55` in front; a number that
 * already carries a country code (12 to 15 digits, the E.164 range that no
 * Brazilian national number can reach) is returned untouched, so a foreign
 * client's number still works.
 *
 * Everything else returns an empty string rather than a best guess. Handing back
 * the digits as typed is what the naive version does, and it builds a `wa.me`
 * URL that opens WhatsApp on a number nobody owns — a typo becomes a dead chat
 * window instead of a disabled button.
 *
 * Trunk and carrier-selection prefixes (`0`, `021`, …) are **not** stripped: a
 * leading zero is ambiguous between the two, so a number carrying one reads as
 * invalid instead of being silently reinterpreted. Pass the plain number. The
 * leading zero is what rules it out even at a plausible length — no E.164
 * country code starts with `0`, so `011999998888` is a national number wearing a
 * trunk prefix, never an international one.
 *
 * @example
 * toWhatsAppNumber("(11) 99999-8888"); // "5511999998888"
 * toWhatsAppNumber("+55 11 99999-8888"); // "5511999998888"
 * toWhatsAppNumber("99999-8888"); // "" — no area code, nothing to dial
 *
 * @param phone - Phone number in any shape: masked, spaced, `+`-prefixed.
 * @returns Digits ready for a `wa.me` link, or an empty string when the input
 *   cannot be resolved to a dialable number.
 */
export function toWhatsAppNumber(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (NATIONAL_LENGTHS.has(digits.length)) return `${BR_COUNTRY_CODE}${digits}`;
    const withinE164 = digits.length >= E164_MIN_WITH_COUNTRY_CODE && digits.length <= E164_MAX;
    if (withinE164 && !digits.startsWith("0")) return digits;
    return "";
}

/**
 * Build the `wa.me` deep link that opens a chat with an optional message
 * already typed.
 *
 * This is a **deep link, never a send**: the chat opens with the text ready and
 * the person presses send. That is the feature, not a limitation — it needs no
 * official Cloud API, no approved template and no business verification, and it
 * cannot let the UI claim a message was delivered when it was not.
 *
 * `api.whatsapp.com/send?phone=…` is deliberately not offered as an alternative
 * host: both resolve to the same chooser, and `wa.me` is the short form of it.
 *
 * @example
 * whatsAppUrl("(11) 99999-8888", "Seu horário é amanhã às 14h.");
 * // "https://wa.me/5511999998888?text=Seu%20hor%C3%A1rio%20%C3%A9%20amanh%C3%A3%20%C3%A0s%2014h."
 *
 * @param phone - Phone number in any shape; normalised by {@link toWhatsAppNumber}.
 * @param text - Message to pre-fill. Omitted or empty leaves the composer blank.
 * @returns The `https://wa.me/…` URL, or an empty string when the number cannot
 *   be normalised.
 */
export function whatsAppUrl(phone: string, text?: string): string {
    const number = toWhatsAppNumber(phone);
    if (!number) return "";
    const url = `https://wa.me/${number}`;
    return text ? `${url}?text=${encodeURIComponent(text)}` : url;
}

/**
 * Open the WhatsApp chat in a new tab.
 *
 * @example
 * <Button onClick={() => openWhatsApp(client.phone, greeting)}>
 *     Falar no WhatsApp
 * </Button>
 *
 * @param phone - Phone number in any shape; normalised by {@link toWhatsAppNumber}.
 * @param text - Message to pre-fill. Omitted or empty leaves the composer blank.
 * @returns `true` when a URL was built and the open was requested, `false` when
 *   the number is unusable or there is no `window` (test runner, service worker,
 *   build plugin). It reports the **request**, not the tab: opening with
 *   `noopener` makes `window.open` return `null` even on success, so its result
 *   cannot distinguish a blocked popup from an opened one.
 */
export function openWhatsApp(phone: string, text?: string): boolean {
    if (typeof window === "undefined") return false;
    const url = whatsAppUrl(phone, text);
    if (!url) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
}
