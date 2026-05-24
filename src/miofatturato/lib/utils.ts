type ClassValue = string | number | null | undefined | false | ClassValue[] | { [key: string]: boolean };

const flatten = (input: ClassValue): string[] => {
  if (!input) return [];

  if (typeof input === 'string' || typeof input === 'number') {
    return [String(input)];
  }

  if (Array.isArray(input)) {
    return input.flatMap(flatten);
  }

  return Object.entries(input)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([className]) => className);
};

export function cn(...inputs: ClassValue[]): string {
  return inputs.flatMap(flatten).join(' ');
}
