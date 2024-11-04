export function hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

let byReferenceId = 0;
const byReferenceRegistry = new WeakMap<object, number>();

export function getPropsHash(props: Record<string, any>): string {
    let valueHash = '';
    for (const prop in props) {
        let value = props[prop];
        const oValue = value;
        if (typeof value === 'object' || typeof value === 'function') {
            value = byReferenceRegistry.get(value);
            if (value === undefined) {
                value = ++byReferenceId;
                byReferenceRegistry.set(oValue, value);
            }
        }
        valueHash = valueHash + String(value);
    }
    return valueHash;
}
