import "server-only";
import { Buffer } from "node:buffer";

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

function getDosDateTimeParts(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);

  return { dosDate, dosTime };
}

function computeCRC32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc =
      CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^
      (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createLocalFileHeader({
  nameBuffer,
  crc32,
  uncompressedSize,
  dosDate,
  dosTime,
}) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc32 >>> 0, 14);
  header.writeUInt32LE(uncompressedSize >>> 0, 18);
  header.writeUInt32LE(uncompressedSize >>> 0, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function createCentralDirectoryHeader({
  nameBuffer,
  crc32,
  uncompressedSize,
  dosDate,
  dosTime,
  localHeaderOffset,
}) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(dosTime, 12);
  header.writeUInt16LE(dosDate, 14);
  header.writeUInt32LE(crc32 >>> 0, 16);
  header.writeUInt32LE(uncompressedSize >>> 0, 20);
  header.writeUInt32LE(uncompressedSize >>> 0, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(localHeaderOffset >>> 0, 42);
  return header;
}

function createEndOfCentralDirectoryRecord({
  entryCount,
  centralDirectorySize,
  centralDirectoryOffset,
}) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralDirectorySize >>> 0, 12);
  record.writeUInt32LE(centralDirectoryOffset >>> 0, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

export function createStoredZip(files) {
  const normalizedFiles = files.map((file) => ({
    nameBuffer: Buffer.from(String(file.name), "utf8"),
    dataBuffer: Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(String(file.data ?? ""), "utf8"),
  }));

  const now = getDosDateTimeParts();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  normalizedFiles.forEach((file) => {
    const crc32 = computeCRC32(file.dataBuffer);
    const localHeader = createLocalFileHeader({
      nameBuffer: file.nameBuffer,
      crc32,
      uncompressedSize: file.dataBuffer.length,
      dosDate: now.dosDate,
      dosTime: now.dosTime,
    });

    localParts.push(localHeader, file.nameBuffer, file.dataBuffer);

    const centralHeader = createCentralDirectoryHeader({
      nameBuffer: file.nameBuffer,
      crc32,
      uncompressedSize: file.dataBuffer.length,
      dosDate: now.dosDate,
      dosTime: now.dosTime,
      localHeaderOffset: localOffset,
    });
    centralParts.push(centralHeader, file.nameBuffer);

    localOffset +=
      localHeader.length + file.nameBuffer.length + file.dataBuffer.length;
  });

  const centralDirectoryOffset = localOffset;
  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = createEndOfCentralDirectoryRecord({
    entryCount: normalizedFiles.length,
    centralDirectorySize: centralDirectory.length,
    centralDirectoryOffset,
  });

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
