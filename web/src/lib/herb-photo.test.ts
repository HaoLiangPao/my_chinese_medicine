import { describe, expect, it } from "vitest";
import { creditText, photoCaption, photoSrc, resolvePhoto, thumbSrc, type HerbPhoto } from "./herb-photo";

const photo = (over: Partial<HerbPhoto> = {}): HerbPhoto => ({
  herb_id: "h1",
  file: "huang-qi.webp",
  kind: "饮片",
  author: "Someone",
  license: "CC BY-SA 4.0",
  license_url: "https://creativecommons.org/licenses/by-sa/4.0",
  source_url: "https://commons.wikimedia.org/wiki/File:X.jpg",
  width: 800,
  height: 600,
  ...over,
});

describe("photoSrc / thumbSrc", () => {
  it("只接受 <拼音>.webp", () => {
    expect(photoSrc("huang-qi.webp")).toBe("/herb-photos/huang-qi.webp");
    expect(thumbSrc("huang-qi.webp")).toBe("/herb-photos/huang-qi.thumb.webp");
    expect(photoSrc("../secret.webp")).toBeNull();
    expect(photoSrc("huang-qi.jpg")).toBeNull();
    expect(photoSrc("https://example.com/a.webp")).toBeNull();
    expect(thumbSrc("a/b.webp")).toBeNull();
  });
});

describe("resolvePhoto", () => {
  it("自己的优先", () => {
    expect(resolvePhoto(photo({ herb_id: "own" }), photo({ herb_id: "base" }))).toEqual({
      photo: photo({ herb_id: "own" }),
      fromBase: false,
    });
  });
  it("炮制品没有自己的照片 → 用原药材的", () => {
    expect(resolvePhoto(null, photo({ herb_id: "base" }))).toEqual({ photo: photo({ herb_id: "base" }), fromBase: true });
  });
  it("都没有 → null（页面显示占位图）", () => {
    expect(resolvePhoto(null, null)).toBeNull();
  });
  it("文件名不合法的当作没有", () => {
    expect(resolvePhoto(photo({ file: "../x.webp" }), null)).toBeNull();
  });
});

describe("photoCaption", () => {
  it("写明是饮片还是原植物；用原药材的图要注明", () => {
    expect(photoCaption(photo(), false, null)).toBe("饮片");
    expect(photoCaption(photo({ kind: "植物" }), false, null)).toBe("原植物");
    expect(photoCaption(photo({ kind: "植物" }), true, "黄芪")).toBe("原植物 · 图为原药材黄芪");
  });
});

describe("creditText", () => {
  it("作者 · 授权 · 来源", () => {
    expect(creditText(photo())).toBe("图：Someone · CC BY-SA 4.0 · Wikimedia Commons");
  });
  it("公有领域没有作者", () => {
    expect(creditText(photo({ author: null, license: "Public domain" }))).toBe("图 · Public domain · Wikimedia Commons");
    expect(creditText(photo({ author: "  ", license: "CC0" }))).toBe("图 · CC0 · Wikimedia Commons");
  });
});
