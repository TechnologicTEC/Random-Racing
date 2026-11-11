/**
 * A small stable hash (32-bit FNV-1a) for checking that two runs produced
 * exactly the same data. Not for security.
 */
export interface Hasher {
  /** Mixes in numbers, bit for bit. */
  numbers(values: ArrayLike<number>): Hasher;
  text(value: string): Hasher;
  /** Eight hexadecimal digits. */
  digest(): string;
}

export function createHasher(): Hasher {
  let hash = 0x811c9dc5;
  const view = new DataView(new ArrayBuffer(8));
  const addByte = (byte: number): void => {
    hash = Math.imul(hash ^ byte, 0x01000193);
  };

  const hasher: Hasher = {
    numbers(values) {
      for (let i = 0; i < values.length; i++) {
        view.setFloat64(0, values[i]!, true);
        for (let b = 0; b < 8; b++) addByte(view.getUint8(b));
      }
      return hasher;
    },
    text(value) {
      for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        addByte(code & 0xff);
        addByte(code >>> 8);
      }
      addByte(0xff);
      return hasher;
    },
    digest() {
      return (hash >>> 0).toString(16).padStart(8, '0');
    },
  };
  return hasher;
}
