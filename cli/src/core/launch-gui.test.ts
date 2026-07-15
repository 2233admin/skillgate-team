import { describe, expect, it } from "vitest";
import { desktopBinaryCandidates, findInstalledDesktop } from "./launch-gui";

describe("Skillgate Desktop launcher", () => {
  it("prefers an explicit packaged binary override", () => {
    const candidates = desktopBinaryCandidates("win32", {
      SKILLGATE_DESKTOP_BIN: "D:\\Apps\\Skillgate.exe",
      LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
      PROGRAMFILES: "C:\\Program Files",
    }, "C:\\Users\\test");
    expect(candidates[0]).toBe("D:\\Apps\\Skillgate.exe");
  });

  it("returns null when no packaged candidate exists", () => {
    expect(findInstalledDesktop(["Z:\\not-installed\\Skillgate.exe"])).toBeNull();
  });

  it("includes platform-native package locations", () => {
    expect(desktopBinaryCandidates("darwin", {}, "/Users/test")).toContain(
      "/Applications/Skillgate.app/Contents/MacOS/skillgate-desktop",
    );
    expect(desktopBinaryCandidates("linux", {}, "/home/test")).toContain(
      "/usr/bin/skillgate-desktop",
    );
  });
});

