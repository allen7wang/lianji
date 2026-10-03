"""Install a signed APK on an isolated emulator and verify native startup."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import xml.etree.ElementTree as ET


PACKAGE = "com.allenwang.lianji"
PROGRAM_COUNT = len(json.loads(Path("assets/plans/training-programs.json").read_text()))
APK = Path(sys.argv[1])
RESULTS = Path(sys.argv[2])
RESULTS.mkdir(parents=True, exist_ok=True)


def adb(*args, check=True):
    return subprocess.run(
        ["adb", "-e", *args], check=check, capture_output=True, timeout=30
    )


def screen(name, expected):
    deadline = time.monotonic() + 90
    last_error = ""
    while time.monotonic() < deadline:
        adb("shell", "rm", "-f", "/sdcard/lianji-qa.xml")
        dump = adb("shell", "uiautomator", "dump", "/sdcard/lianji-qa.xml", check=False)
        last_error = (dump.stdout + dump.stderr).decode("utf-8", errors="replace")
        if dump.returncode == 0:
            captured = adb("shell", "cat", "/sdcard/lianji-qa.xml", check=False)
            if captured.returncode != 0:
                last_error += captured.stderr.decode("utf-8", errors="replace")
                time.sleep(3)
                continue
            raw = captured.stdout
            (RESULTS / f"{name}.xml").write_bytes(raw)
            try:
                root = ET.fromstring(raw)
                labels = " ".join(
                    node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")
                    for node in root.iter("node")
                )
                if all(label in labels for label in expected):
                    (RESULTS / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p").stdout)
                    assert adb("shell", "pidof", PACKAGE).stdout.strip(), "App exited"
                    print(f"Verified {name}: {expected}", flush=True)
                    return
                last_error = labels
            except ET.ParseError as error:
                last_error = str(error)
        time.sleep(3)
    raise AssertionError(f"{name} did not show {expected}: {last_error}")


try:
    adb("install", "--no-streaming", str(APK))
    # The CI image's Pixel Launcher can ANR during package installation and leave
    # a system dialog over a healthy app. Stop only that launcher, never Lianji.
    adb("shell", "am", "force-stop", "com.google.android.apps.nexuslauncher")
    adb("logcat", "-c")
    adb("shell", "wm", "dismiss-keyguard")
    adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/.MainActivity")
    screen("home", ["今天练什么？", "开始自由训练"])
    adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "lianji://plans", PACKAGE)
    screen("plans", ["训练计划", f"计划模板 · {PROGRAM_COUNT} 套"])
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n", f"{PACKAGE}/.MainActivity", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER")
    screen("relaunch", ["今天练什么？", "开始自由训练"])
    crash = adb("logcat", "-b", "crash", "-d").stdout.decode("utf-8", errors="replace")
    (RESULTS / "crash-log.txt").write_text(crash)
    assert not (PACKAGE in crash and "FATAL EXCEPTION" in crash), "App crashed"
    report = {
        "apkSha256": hashlib.sha256(APK.read_bytes()).hexdigest(),
        "package": PACKAGE,
        "androidApi": adb("shell", "getprop", "ro.build.version.sdk").stdout.decode().strip(),
        "checks": ["signed APK installation", "home screen", "program templates entry", "cold relaunch", "no app crash"],
        "result": "passed",
    }
    (RESULTS / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)
finally:
    (RESULTS / "crash-log.txt").write_bytes(adb("logcat", "-b", "crash", "-d", check=False).stdout)
    (RESULTS / "device-log.txt").write_bytes(adb("logcat", "-d", check=False).stdout)
    final_screen = adb("exec-out", "screencap", "-p", check=False)
    if final_screen.returncode == 0:
        (RESULTS / "last-screen.png").write_bytes(final_screen.stdout)
