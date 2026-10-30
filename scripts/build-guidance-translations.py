#!/usr/bin/env python3
"""Build the reviewed, exact-source Jackery guidance translation overlay.

This is a local, human-authored translation dictionary. It does not call a
translation service or modify the source catalog. Run with --check to verify
coverage, table structure, numbers, source ASCII identifiers, and reproducibility.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "catalogs/jackery-eu-20261030.json"
OUTPUT = ROOT / "catalogs/jackery-guidance-translations.json"
REPORT = ROOT / "docs/guidance-translation/TRANSLATION_REPORT.md"
VERSION = "jackery-guidance-en-20261030"
HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")

# Whole labels/titles/descriptions: keys must equal the source text exactly.
SHORT = {
    "DC输入": "DC Input",
    "AC输入": "AC Input",
    "USB口输出": "USB Port Output",
    "车充输出": "Car Charging Port Output",
    "AC输出\nAC频率": "AC Output\nAC Frequency",
    "显示屏": "Display",
    "LED测试": "LED Test",
    "BMS通讯故障": "BMS Communication Fault",
    "BMS与主板之间通讯故障": "Communication fault between the BMS and the mainboard",
    "逆变器通信故障": "Inverter Communication Fault",
    "逆变器与主板之间通信故障": "Communication fault between the inverter and the mainboard",
    "充电模块通信故障": "Charging Module Communication Fault",
    "DC充电模块与BMS通信故障": "Communication fault between the DC charging module and the BMS",
    "电池故障": "Battery Fault",
    "BMS内部故障或电池故障": "Internal BMS fault or battery fault",
    "电池过压": "Battery Overvoltage",
    "电池单体过压": "Battery cell overvoltage",
    "电池欠压": "Battery Undervoltage",
    "电池单体欠压": "Battery cell undervoltage",
    "逆变器异常": "Inverter Abnormality",
    "交流输出过流/过载/短路；市电输入过/欠，过\n/欠频；逆变器过温保护": "AC output overcurrent/overload/short circuit; mains input over/under, over\n/underfrequency; inverter overtemperature protection",
    "充电模块异常": "Charging Module Abnormality",
    "光伏输入过压；DC充电模块过温保护；DC充电\n模块输出过流保护": "Photovoltaic input overvoltage; DC charging module overtemperature protection; DC charging\nmodule output overcurrent protection",
    "电池充放电过流/短路": "Battery Charging/Discharging Overcurrent/Short Circuit",
    "BMS过流/短路保护": "BMS overcurrent/short-circuit protection",
    "DC输出过流/短路": "DC Output Overcurrent/Short Circuit",
    "DC、USB输出过流/短路": "DC, USB output overcurrent/short circuit",
    "故障判断（DC、AC输入类）": "Fault Diagnosis (DC, AC Input)",
    "故障判断（AC输出类）": "Fault Diagnosis (AC Output)",
    "故障判断（USB、车充口）": "Fault Diagnosis (USB, Car Charging Port)",
    "故障判断（显示类）": "Fault Diagnosis (Display)",
    "故障判断（风扇类、LED照明）": "Fault Diagnosis (Fan, LED Lighting)",
    "充放电高温": "High Temperature During Charging/Discharging",
    "电芯温度过高，高温保护": "Cell temperature too high; high-temperature protection",
    "充放电低温": "Low Temperature During Charging/Discharging",
    "电芯温度过低，低温保护": "Cell temperature too low; low-temperature protection",
    "AC输出测试": "AC Output Test",
    "1、DC输入": "1. DC Input",
    "2、AC输入": "2. AC Input",
    "1、USB口输出": "1. USB Port Output",
    "2、车充口输出": "2. Car Charging Port Output",
    "3、AC交流输出": "3. AC Output",
    "AC频率": "AC Frequency",
    "LED照明": "LED Lighting",
}

# Exact table fragments separated only by the original newlines and " | ".
# Reassembly preserves every separator, blank cell, line break, and slash row.
# These are complete manual translations; no inferred merged-cell associations
# or extra repair steps are introduced.
TABLE_CELLS = {
    "不良现象": "Fault Symptom",
    "故障排查方法": "Troubleshooting Method",
    "原因排查": "Cause Investigation",
    "更换部件": "Replacement Part",
    "测试工具": "Test Equipment",
    "DC输入不良": "DC input fault",
    "用DC可调电源给储能充电，并观察DC可调电源输出功率": "Charge the power station with a DC adjustable power supply and observe the output power of the DC adjustable power supply",
    "检查储能DC输入口是否松动或损坏，可用万用表测量DC转接板的正负极是否有电压输出": "Check whether the power station's DC input port is loose or damaged; use a multimeter to check for voltage output across the positive and negative terminals of the DC adapter board",
    "检查充电板是否有输出电压，如无输出，则替换充电板进行故障排查": "Check the charging board for output voltage; if there is no output, substitute the charging board to troubleshoot",
    "检查电池保护板电池正负极电压是否正常，如正常则测试电池保护板输入输出端电压是否正常，不正常则替换电池保护板进行故障排查": "Check whether the voltage across the battery positive and negative terminals on the battery protection board is normal; if normal, test whether the voltages at the battery protection board's input and output terminals are normal; if abnormal, substitute the battery protection board to troubleshoot",
    "充电接口": "Charging connector",
    "DC可调电源": "DC adjustable power supply",
    "万用表": "Multimeter",
    "充电板": "Charging board",
    "更换充电板": "Replace the charging board",
    "电池保护板": "Battery protection board",
    "更换电池保护板": "Replace the battery protection board",
    "太阳能板": "Solar panel",
    "用万用表测量太阳能板输出电压是否正常": "Use a multimeter to check whether the solar panel output voltage is normal",
    "接入测试设备，测试是否有功率输出": "Connect the test equipment and test for power output",
    "储能": "Power station",
    "AC输入不良": "AC input fault",
    "接AC测试仪给储能充电，观察AC测试仪上面输出功率": "Connect an AC tester to charge the power station and observe the output power on the AC tester",
    "用万用表测量用户退回的AC线，确认AC是否正常": "Use a multimeter to test the AC cable returned by the user and confirm whether AC is normal",
    "AC线": "AC cable",
    "AC测试仪": "AC tester",
    "品字输入接口": "Three-pin input connector",
    "观察储能AC输入口是否松动或损坏，可用万用表测量品字接口尾端是否有电压输出": "Check whether the power station's AC input port is loose or damaged; use a multimeter to check for voltage output at the rear of the three-pin connector",
    "过流保护器": "Overcurrent protector",
    "检查AC输入过流保护器插头是否连接良好，可用万用表蜂鸣档测量过流保护器是否OK": "Check whether the AC input overcurrent protector plug is connected properly; use the multimeter's continuity buzzer mode to check whether the overcurrent protector is OK",
    "双向逆变器": "Bidirectional inverter",
    "在未接入AC输入的前提下，启动AC控制键，观察AC输出是否正常，如输出不正常则替换双向逆变器进行问题验证": "With no AC input connected, activate the AC control button and check whether AC output is normal; if the output is abnormal, substitute the bidirectional inverter to verify the issue",
    "电量无法充满": "Battery cannot be fully charged",
    "将储能进行系统复位": "Reset the power station's system",
    "长按数显键和USB控制按键进行复位，确认是否通过重置系统可以解决": "Press and hold the display button and USB control button to reset; check whether resetting the system resolves the issue",
    "系统错误": "System error",
    "检查电池保护板电池正负极电压是否正常，如正常则测试电池保护板输出电压是否正常，不正常则替换电池保护板进行故障排查": "Check whether the voltage across the battery positive and negative terminals on the battery protection board is normal; if normal, test whether the battery protection board's output voltage is normal; if abnormal, substitute the battery protection board to troubleshoot",
    "电池保护板损坏": "Battery protection board damaged",
    "测量单组电芯电压，是否在标准范围值内，": "Measure the voltage of an individual cell group to check whether it is within the standard range,",
    "电池组": "Battery pack",
    "AC不能启动": "AC cannot be activated",
    "确认产品电量是否充足": "Confirm whether the product has sufficient battery charge",
    "电量不足，需给产品补电": "Insufficient battery charge; recharge the product",
    "补电": "Recharge",
    "电量正常，但AC无法启动，测试AC控制是否OK，如不良则更换主板，如OK则替换": "Battery charge is normal, but AC cannot be activated; test whether AC control is OK; if faulty, replace the mainboard; if OK, substitute",
    "逆变器": "Inverter",
    "主板": "Mainboard",
    "AC可启动，但无输出": "AC can be activated, but there is no output",
    "开启USB/DC/AC开关": "Turn on the USB/DC/AC switches",
    "将AC负载调到储能输出最大功率（参考机身规格信息标贴）进行验证测试": "Adjust the AC load to the power station's maximum output power (refer to the specification label on the unit) to perform a verification test",
    "设备功率过大，产品输出保护": "Equipment power is too high; product output protection",
    "AC负载": "AC load",
    "目测AC插座是否异常，用万用表进行验证测试": "Visually inspect the AC socket for abnormalities and use a multimeter to verify",
    "AC插座": "AC socket",
    "USB输出测试正常，AC无输出，可替换逆变器进行验证测试": "USB output tests normal, but AC has no output; substitute the inverter for verification testing",
    "USB、AC均无输出，判断主板不良，可替换主板进行验证测试": "Neither USB nor AC has output, indicating a faulty mainboard; substitute the mainboard for verification testing",
    "AC放电自动关闭输出": "AC output shuts off automatically during discharge",
    "开启AC，用AC负载放电": "Turn on AC and discharge with an AC load",
    "设备功率过大，产品自我保护": "Equipment power is too high; product self-protection",
    "超过输出功率": "Output power exceeded",
    "USB充放电功能正常，仅AC会自动关闭输出": "USB charging and discharging functions are normal; only AC output shuts off automatically",
    "USB无输出": "No USB output",
    "确保产品电量充足的情况下，测试AC、USB是否输出正常": "With sufficient product battery charge ensured, test whether AC and USB outputs are normal",
    "AC输出正常。 4个USB端口中某USB输出异常，判断USB口损坏，更换主板": "AC output is normal. One USB output among the 4 USB ports is abnormal, indicating a damaged USB port; replace the mainboard",
    "DC负载仪": "DC load tester",
    "AC输出正常。 4个USB端口输出都异常，判断主板损坏，更换主板": "AC output is normal. Outputs from all 4 USB ports are abnormal, indicating a damaged mainboard; replace the mainboard",
    "车充无输出": "No car charging port output",
    "确认AC、USB输出正常，按车充口输出按键让车充口启动输出": "Confirm that AC and USB outputs are normal; press the car charging port output button to activate its output",
    "车充指示灯亮，但车充口无输出，测量主板上的车充供电口，如无电压，则主板不良": "The car charging indicator is lit, but the car charging port has no output; measure the car charging power supply port on the mainboard; if there is no voltage, the mainboard is faulty",
    "车充指示灯亮，但车充口无输出，测量主板上的车充供电口，如电压正常，则车充板不良": "The car charging indicator is lit, but the car charging port has no output; measure the car charging power supply port on the mainboard; if the voltage is normal, the car charging board is faulty",
    "车充板": "Car charging board",
    "车充指示灯不亮，AC、USB输出正常，可测量车充控制按键是否OK，不良则按键损坏": "The car charging indicator is not lit, while AC and USB outputs are normal; test whether the car charging control button is OK; if faulty, the button is damaged",
    "灯板": "Light board",
    "显示屏缺划或模糊": "Missing display segments or blurred display",
    "显示屏白屏或闪烁": "White screen or flickering display",
    "确认产品是否正常工作": "Confirm whether the product operates normally",
    "产品充放电功能正常，仅显示异常，可替换显示屏判断故障": "The product's charging and discharging functions are normal, with only the display abnormal; substitute the display to diagnose the fault",
    "显示屏": "Display",
    "显示屏排线": "Display ribbon cable",
    "排线断线或松动，重插排线或更换排线判断故障": "The ribbon cable is broken or loose; reconnect or replace the ribbon cable to diagnose the fault",
    "显示屏和排线无异常时可替换主板判断故障": "If the display and ribbon cable have no abnormalities, substitute the mainboard to diagnose the fault",
    "显示屏无显示": "No display",
    "给储能充电约10分钟后，观察AC测试仪或DC可调电源输出功率": "After charging the power station for approximately 10 minutes, observe the output power of the AC tester or DC adjustable power supply",
    "电池组电压过低，无法显示，给储能充电10分钟左右，在判断其故障": "The battery pack voltage is too low for the display to operate; charge the power station for approximately 10 minutes, then diagnose the fault",
    "储能无电": "Power station battery depleted",
    "测量单组电芯电压，是否在标准范围值内": "Measure the voltage of an individual cell group to check whether it is within the standard range",
    "数显按键": "Display button",
    "数显控制按键损坏，USB和AC输出正常，显示屏无法激活显示，用万用表测量数显控制按键通断，判断是否其不良": "The display control button is damaged; USB and AC outputs are normal, but the display cannot be activated; use a multimeter to test the display control button's continuity to determine whether it is faulty",
    "风扇不能启动": "Fan cannot start",
    "用AC负载仪放电风扇不转": "The fan does not rotate when discharging with an AC load tester",
    "风扇不良，用万用表测量风扇正负极": "The fan is faulty; use a multimeter to measure across the fan's positive and negative terminals",
    "风扇": "Fan",
    "连接线松动导致，重新插拔连接": "Caused by a loose connecting cable; disconnect and reconnect it",
    "重插连接器": "Reconnect the connector",
    "逆变器不良，导致风扇接口无法正常供电，风扇无法工作，会导致逆变器工作一段时间后，高温报警，储能不能正常工作，用万用表测量逆变器风扇接口是否有电压输出": "A faulty inverter prevents the fan connector from supplying power normally, so the fan cannot operate; after the inverter operates for a period, this causes a high-temperature alarm and prevents the power station from operating normally; use a multimeter to check for voltage output at the inverter's fan connector",
    "LED照明灯不亮": "LED light does not illuminate",
    "检查主板USB输出是否正常，如不正常则考虑主板损坏": "Check whether the mainboard's USB output is normal; if abnormal, consider possible mainboard damage",
    "LED不亮，测量LED两端电压，电压正常，LED不亮，则LED损坏": "If the LED does not illuminate, measure the voltage across the LED; if the voltage is normal but the LED does not illuminate, the LED is damaged",
    "LED按键不良，导致控制信号无法输出，用万用表测量控制按键导通": "A faulty LED button prevents the control signal from being output; use a multimeter to test the control button's continuity",
    "LED控制按键": "LED control button",
}

# Display aliases only: source.file/source.sheet and all paths/hashes stay exact.
SOURCE_LABELS = {
    "故障代码.pptx": "Fault Codes.pptx",
    "常见故障及解决方案.pptx": "Common Faults and Solutions.pptx",
    "功能测试标准.xlsx": "Functional Test Standards.xlsx",
    "功能测试SOP.xlsx": "Functional Test SOP.xlsx",
    "功能测试.pptx": "Functional Test.pptx",
    "欧盟-E1000pro-70-1000-DEOR01黑橙色BOM.xlsx": "EU-E1000pro-70-1000-DEOR01 Black and Orange BOM.xlsx",
    "欧盟-E1000V2-21-0001-000221原始版本BOM.xlsx": "EU-E1000V2-21-0001-000221 Original Version BOM.xlsx",
    "欧盟-E1000V2-21-0001-000221降本版本BOM.xlsx": "EU-E1000V2-21-0001-000221 Cost-Reduced Version BOM.xlsx",
    "欧盟-E1000-70-1000-EUO001黑橙色BOM.xlsx": "EU-E1000-70-1000-EUO001 Black and Orange BOM.xlsx",
    "欧盟-E2000plus-A版本-21-0001-00037黑橙色BOM.xlsx": "EU-E2000plus-A Version-21-0001-00037 Black and Orange BOM.xlsx",
    "欧盟-E2000plus-B版本-21-0001-000184BOM.xlsx": "EU-E2000plus-B Version-21-0001-000184 BOM.xlsx",
    "欧盟-E2000pro-70-2000-EUOR01黑橙色BOM.xlsx": "EU-E2000pro-70-2000-EUOR01 Black and Orange BOM.xlsx",
    "欧盟-E2000V2-21-0001-000267原始版本BOM.xlsx": "EU-E2000V2-21-0001-000267 Original Version BOM.xlsx",
    "欧盟-E2000V2-21-0001-000267降本版本BOM.xlsx": "EU-E2000V2-21-0001-000267 Cost-Reduced Version BOM.xlsx",
    "功能测试": "Functional Test",
    "树形单据体": "Tree-Structured Document Body",
}


def fields(value, path=""):
    """Walk paired guidance fields; never interpret BOM description/identity."""
    if isinstance(value, dict):
        for key, child in value.items():
            if key.endswith("Zh") and isinstance(child, str):
                yield path + "." + key, child, value.get(key[:-2] + "En", "")
            if isinstance(child, (dict, list)):
                yield from fields(child, path + "." + key)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from fields(child, path + f"[{index}]")


def source_labels(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"file", "sheet", "sheetName"} and isinstance(child, str) and HAN.search(child):
                yield child
            if isinstance(child, (dict, list)):
                yield from source_labels(child)
    elif isinstance(value, list):
        for child in value:
            yield from source_labels(child)


def translate_table(text):
    parts = re.split(r"(\n| \| )", text)
    return "".join(TABLE_CELLS[part] if HAN.search(part) else part for part in parts)


def verify_entry(zh, en, is_table=False):
    assert en and not HAN.search(en), f"Empty or untranslated English: {zh!r}"
    assert Counter(re.findall(r"\d+(?:\.\d+)?", zh)) == Counter(re.findall(r"\d+(?:\.\d+)?", en)), f"Numbers changed: {zh!r}"
    # Existing source ASCII words and identifiers must not disappear. Extra
    # translated English words can naturally contain the same English letters.
    for token, count in Counter(re.findall(r"[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*", zh)).items():
        assert len(re.findall(r"(?<![A-Za-z0-9])" + re.escape(token) + r"(?![A-Za-z0-9])", en)) >= count, f"Source ASCII token lost: {token}: {zh!r}"
    assert zh.count("\n") == en.count("\n"), f"Line breaks changed: {zh!r}"
    if is_table:
        zh_parts = re.split(r"(\n| \| )", zh)
        en_parts = re.split(r"(\n| \| )", en)
        assert len(zh_parts) == len(en_parts), "Table fragment count changed"
        for original, translated in zip(zh_parts, en_parts):
            if not HAN.search(original):
                assert original == translated, f"Table separator/empty cell changed: {original!r}"
        assert [line.count(" | ") for line in zh.splitlines()] == [line.count(" | ") for line in en.splitlines()], "Table columns changed"


def build(catalog):
    entries = {}
    model_rows = []
    missing_fields = 0
    blank_solutions = 0
    tables = set()
    existing_en = 0
    for model in catalog["models"]:
        missing = []
        for section in ("checkItems", "knowledge"):
            for path, zh, en in fields(model.get(section, []), section):
                if zh and not en:
                    missing.append((path, zh))
                    if path.endswith("stepsZh"):
                        tables.add(zh)
                        translated = translate_table(zh)
                    else:
                        translated = SHORT[zh]
                    verify_entry(zh, translated, path.endswith("stepsZh"))
                    if zh in entries:
                        assert entries[zh] == translated
                    entries[zh] = translated
                elif en:
                    existing_en += 1
                if path.endswith("solutionZh") and not zh:
                    blank_solutions += 1
        missing_fields += len(missing)
        model_rows.append((model["catalogKey"], len(missing)))
    labels = list(dict.fromkeys(source_labels(catalog)))
    for zh in labels:
        en = SOURCE_LABELS[zh]
        verify_entry(zh, en)
        entries.setdefault(zh, en)
    result = {
        "schemaVersion": 1,
        "version": VERSION,
        "entries": [{"textZh": zh, "textEn": en} for zh, en in entries.items()],
    }
    assert len(result["entries"]) == len({entry["textZh"] for entry in result["entries"]})
    return result, model_rows, missing_fields, blank_solutions, tables, existing_en, len(labels)


def render_report(result, model_rows, occurrences, blank_solutions, tables, existing_en, label_count):
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    model_table = "\n".join(f"| `{key}` | {count} | {count} |" for key, count in model_rows)
    return f"""# Jackery 英文指导翻译校验报告

日期：2026-10-30。版本：`{VERSION}`。

## 范围与交付

- 源目录：`catalogs/jackery-eu-20261030.json`；SHA-256：`{digest}`。
- 翻译层：`catalogs/jackery-guidance-translations.json`，schemaVersion 为 1，按完整中文字符串精确去重。
- 人工翻译全部 {len(model_rows)} 个产品目录中 checkItems、faultCodes、repairGuides、notices 的非空中文且原英文为空的字段：共 {occurrences} 处，{len(result['entries']) - label_count} 个唯一字符串。其中含 {len(tables)} 份完整维修表。
- 另提供 {label_count} 个用户可见来源文件名/工作表名的英文显示别名；总计 {len(result['entries'])} 个条目。别名的 textZh 仍是精确原文件名或工作表名，源 file、sheet、relativePath、sha256 未变更。
- BOM 物料描述不属于本指导翻译层；不改中文、SKU、物料码、型号、故障码、原件或数据库。翻译为人工编写，无外部翻译服务。

## 覆盖校验

| 产品目录 | 需补英文的源字段 | 已覆盖 |
| --- | ---: | ---: |
{model_table}

全部需翻译字段覆盖率为 100%。原有非空英文字段 {existing_en} 处保留优先级；翻译层只提供缺失英文的候选值。空中文 solutionZh 共 {blank_solutions} 处，源文未提供解决方案，仍保持空值，未从维修表或相邻故障行推断补写。

## 结构与语义检查

- 所有 textZh 与源字符串逐字匹配；五份维修表保留原换行、五列分隔符、空单元格和 `/` 占位行。合并单元格未补齐、未映射成特定 F 故障码。
- 英文无汉字；源中数字和 ASCII 标识符均校验保留，包括 AC、DC、USB、LED、BMS、OK、4 个 USB 端口和约 10 分钟。
- F0 为 `BMS Communication Fault`；说明为 `Communication fault between the BMS and the mainboard`。
- `未接入AC输入` 明确译为 `With no AC input connected`；`如正常`、`不正常则`、`如无输出`、`如不良`、`如OK则` 的条件和否定语义保留。
- AC 无法启动表中两条原文止于“如OK则替换”，英文同样止于 `if OK, substitute`；不将相邻更换部件栏擅自补入句子。
- F6 原文“市电输入过/欠”未写完整限定，英文保留 `mains input over/under` 的有限表达，未增补电压或阈值。其余“标准范围”“最大功率”亦未补规格数值。
- USB/AC 无输出、指示灯亮/不亮、主板/车充板分支按各自源行翻译；未添加替换料、拆机步骤或源文没有的额外操作。

## 可重复验证

```powershell
python scripts/build-guidance-translations.py --check
```

脚本验证覆盖率、精确源字符串去重、无汉字英文、数字和源 ASCII 标识符、逐行分隔符与空单元格，并比较生成 JSON/报告与磁盘文件。普通运行只重建这两个交付文件，不修改源目录。

此报告验证翻译覆盖和源文保真，不构成维修操作的技术认证；本次未进行实机维修验证。
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify without writing files")
    args = parser.parse_args()
    original = SOURCE.read_bytes()
    built = build(json.loads(original))
    result = built[0]
    rendered_json = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    report = render_report(*built)
    for path, content in ((OUTPUT, rendered_json), (REPORT, report)):
        if args.check:
            assert path.read_text(encoding="utf-8") == content, f"Generated file differs: {path}"
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    assert SOURCE.read_bytes() == original, "Source catalog changed"
    print(json.dumps({
        "ok": True,
        "models": len(built[1]),
        "guidanceFieldOccurrences": built[2],
        "uniqueGuidanceStrings": len(result["entries"]) - built[6],
        "sourceDisplayAliases": built[6],
        "entries": len(result["entries"]),
        "completeTables": len(built[4]),
        "blankSolutionFieldsPreserved": built[3],
        "sourceSha256": hashlib.sha256(original).hexdigest(),
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
