import { describe, expect, it } from "vitest";
import { fitWithin, jarPhotoFolder, jarPhotoPath, sniffImage, staleJarFiles } from "./jar-photo";

const WS = "11111111-1111-1111-1111-111111111111";
const HERB = "22222222-2222-2222-2222-222222222222";
const FILE = "33333333-3333-3333-3333-333333333333";

describe("jarPhotoPath", () => {
  it("<药柜>/<药材>/<uuid>.<格式>", () => {
    expect(jarPhotoPath(WS, HERB, FILE, "webp")).toBe(`${WS}/${HERB}/${FILE}.webp`);
    expect(jarPhotoPath(WS, HERB, FILE, "jpg")).toBe(`${WS}/${HERB}/${FILE}.jpg`);
    expect(jarPhotoFolder(WS, HERB)).toBe(`${WS}/${HERB}`);
  });
  it("id 格式不对就报错（防止拼出别的路径）", () => {
    expect(() => jarPhotoPath("..", HERB, FILE, "webp")).toThrow();
    expect(() => jarPhotoPath(WS, `${HERB}/x`, FILE, "webp")).toThrow();
  });
});

describe("sniffImage", () => {
  const bytes = (...xs: (number | string)[]) =>
    Uint8Array.from(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
  it("看文件头", () => {
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("webp");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(sniffImage(bytes(0x89, "PNG"))).toBeNull();
    expect(sniffImage(bytes("<svg"))).toBeNull();
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("fitWithin", () => {
  it("长边缩到 1200，不放大", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 900, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(5000, 1)).toEqual({ width: 1200, height: 1 });
  });
});

describe("staleJarFiles", () => {
  it("文件夹里除了现在用的都删", () => {
    const folder = `${WS}/${HERB}`;
    expect(staleJarFiles(folder, ["a.webp", "b.jpg"], `${folder}/b.jpg`)).toEqual([`${folder}/a.webp`]);
    expect(staleJarFiles(folder, ["a.webp"], null)).toEqual([`${folder}/a.webp`]);
    expect(staleJarFiles(folder, [], null)).toEqual([]);
  });
});
