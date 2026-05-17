function digitsOnly(value: string): string {
    return value.replace(/\D/g, "");
}

/**
 * Validate a Brazilian CPF using the standard check-digit algorithm.
 * Accepts masked or raw input; rejects all-equal digits ("111.111.111-11").
 */
export function validateCPF(value: string): boolean {
    const digits = digitsOnly(value);
    if (digits.length !== 11) return false;
    if (/^(\d)\1+$/.test(digits)) return false;

    const numbers = digits.split("").map(Number);

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += numbers[i]! * (10 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== numbers[9]) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += numbers[i]! * (11 - i);
    check = (sum * 10) % 11;
    if (check === 10) check = 0;
    return check === numbers[10];
}

/**
 * Validate a Brazilian CNPJ using the standard check-digit algorithm.
 * Accepts masked or raw input; rejects all-equal digits.
 */
export function validateCNPJ(value: string): boolean {
    const digits = digitsOnly(value);
    if (digits.length !== 14) return false;
    if (/^(\d)\1+$/.test(digits)) return false;

    const numbers = digits.split("").map(Number);

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    for (let i = 0; i < 12; i++) sum += numbers[i]! * weights1[i]!;
    let check = sum % 11;
    check = check < 2 ? 0 : 11 - check;
    if (check !== numbers[12]) return false;

    sum = 0;
    for (let i = 0; i < 13; i++) sum += numbers[i]! * weights2[i]!;
    check = sum % 11;
    check = check < 2 ? 0 : 11 - check;
    return check === numbers[13];
}

/** Format an 11-digit Brazilian CEP-like value as `00000-000`. */
export function formatCEP(value: string): string {
    return digitsOnly(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}

/** Format an unmasked CNPJ-shaped value as `00.000.000/0000-00`. */
export function formatCNPJ(value: string): string {
    return digitsOnly(value)
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Strip any masking and return only digits. */
export function unmask(value: string): string {
    return digitsOnly(value);
}
