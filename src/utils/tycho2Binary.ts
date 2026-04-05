const TYCHO2_MAGIC = "TYC2";
const TYCHO2_VERSION = 1;
const TYCHO2_HEADER_BYTES = 12;
export const TYCHO2_VALUES_PER_STAR = 5;

export interface Tycho2CatalogData {
  count: number;
  data: Float32Array;
}

export function parseTycho2BinaryBuffer(
  buffer: ArrayBuffer
): Tycho2CatalogData {
  if (buffer.byteLength < TYCHO2_HEADER_BYTES) {
    throw new Error("Tycho-2 binary buffer is too small");
  }

  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );

  if (magic !== TYCHO2_MAGIC) {
    throw new Error(`Invalid Tycho-2 binary header: ${magic}`);
  }

  const version = view.getUint32(4, true);
  if (version !== TYCHO2_VERSION) {
    throw new Error(`Unsupported Tycho-2 binary version: ${version}`);
  }

  const count = view.getUint32(8, true);
  const expectedBytes =
    TYCHO2_HEADER_BYTES +
    count * TYCHO2_VALUES_PER_STAR * Float32Array.BYTES_PER_ELEMENT;

  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid Tycho-2 binary size: expected ${expectedBytes} bytes, got ${buffer.byteLength}`
    );
  }

  return {
    count,
    data: new Float32Array(
      buffer,
      TYCHO2_HEADER_BYTES,
      count * TYCHO2_VALUES_PER_STAR
    ),
  };
}
