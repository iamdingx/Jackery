"""Build the reviewed, offline English display enrichment; never alter source BOM data.

The glossary below is manually authored from the source Chinese. Supplier names use
literal Pinyin where the source provides no verified English trade name.
"""
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'catalogs/jackery-eu-20261030.json'
OUTPUT = ROOT / 'catalogs/jackery-bom-translations.json'

# Whole phrases take precedence over smaller terms. No network/translation service.
GLOSSARY_TEXT = '''
储能电源总成|Energy Storage Power Supply Assembly
电池保护板|Battery Protection Board
双向逆变器|Bidirectional Inverter
单向逆变器|Unidirectional Inverter
车充板|Car Charging
主板|Mainboard
灯板|Light Board
155854AC输出硅胶盖|155854AC Output Silicone Cover
转接板|Adapter Board
功率板|Power Board
充电板|Charging Board
采集板|Acquisition Board
前壳组件|Front Housing Assembly
后壳组件|Rear Housing Assembly
上壳组件|Upper Housing Assembly
把手组件|Handle Assembly
拉杆组件|Telescopic Handle Assembly
左装饰盖|Left Decorative Cover
右装饰盖|Right Decorative Cover
左右装饰盖|Left and Right Decorative Covers
装饰盖|Decorative Cover
显示屏镜片|Display Lens
灯镜片|Light Lens
镜片|Lens
灯罩|Lampshade
脚垫转接板|Foot Pad Adapter Plate
硅胶脚垫|Silicone Foot Pad
脚垫|Foot Pad
硅胶片|Silicone Sheet
把手插条|Handle Insert Strip
逆变器通讯线束|Inverter Communication Harness
主板-显示屏线束|Mainboard-to-Display Harness
主板-灯板线|Mainboard-to-Light Board Cable
主板-显示屏线|Mainboard-to-Display Cable
AC输入-逆变器线|AC Input-to-Inverter Cable
AC输入-保险丝线|AC Input-to-Fuse Cable
主板-前充电板线|Mainboard-to-Front Charging Board Cable
主板-逆变器信号线|Mainboard-to-Inverter Signal Cable
主板-BMS信号线|Mainboard-to-BMS Signal Cable
前充电板-BMS线|Front Charging Board-to-BMS Cable
主板-BMS通讯线|Mainboard-to-BMS Communication Cable
扩容板-BMS信号线|Expansion Board-to-BMS Signal Cable
逆变器通讯线|Inverter Communication Cable
车充通讯线|Car Charging Communication Cable
PV通讯线|PV Communication Cable
电压温度采集线|Voltage and Temperature Acquisition Cable
欧规AC输出线|EU AC Output Cable
欧规AC接地线|EU AC Ground Wire
欧规AC输入线|EU AC Input Cable
欧规AC充电线|EU AC Charging Cable
AC输出线正极线|AC Output Positive Wire
AC输出线负极线|AC Output Negative Wire
AC输入线|AC Input Cable
AC输出线|AC Output Cable
AC接地线|AC Ground Wire
AC充电线|AC Charging Cable
车充线警示标贴(通用版本)|Car Charging Cable Warning Label (Universal Version)
车充线警示标贴|Car Charging Cable Warning Label
车充线|Car Charging Cable
DC7909转8020转接头|DC7909-to-8020 Adapter
转接头|Adapter
车充头|Car Charger Plug
彩盒信息标贴|Retail Box Information Label
彩盒产品信息标贴|Retail Box Product Information Label
彩盒参数贴纸|Retail Box Parameter Label
产品图标贴|Product Pictogram Label
产品后标贴|Product Rear Label
后标贴|Rear Label
彩盒封口标|Retail Box Sealing Label
间隔纸封口标|Pattern-Adhesive Paper Sealing Label
充电透明贴纸|Transparent Charging Sticker
显示屏保护膜|Display Protective Film
保护膜|Protective Film
空白贴纸|Blank Sticker
标贴|Label
透明贴纸|Transparent Sticker
彩盒|Retail Box
APP操作说明书|APP Operating Instructions
说明书|Instruction Manual
提手|Carry Handle
下内托|Lower Inner Tray
内托上|Upper Inner Tray
内托下|Lower Inner Tray
配件盒_内托|Accessory Box / Inner Tray
内托|Inner Tray
配件包|Accessory Bag
UN箱|UN Box
通用纸护角（顶部）|Universal Paper Corner Protector (Top)
通用纸护角（底部）|Universal Paper Corner Protector (Bottom)
顶部护角|Top Corner Protector
底部护角|Bottom Corner Protector
竹纤维袋|Bamboo Fiber Bag
磨砂袋|Frosted Bag
隔板|Divider
扩容板|Expansion Board
过流保护器|Overcurrent Protector
风扇|Fan
磁环|Ferrite Ring
屏蔽底板|Shielding Base Plate
底板绝缘片|Base Plate Insulation Sheet
底板PC绝缘片|Base Plate PC Insulation Sheet
前后壳支撑柱|Front/Rear Housing Support Post
前后壳固定插条|Front/Rear Housing Retaining Strip
逆变器支撑架|Inverter Support Bracket
前壳|Front Housing
后壳|Rear Housing
导光柱|Light Guide Post
照明硅胶盖|Lighting Silicone Cover
车充硅胶盖|Car Charging Silicone Cover
硅胶盖|Silicone Cover
按键|Button
短路帽|Jumper Cap
液晶显示屏|Liquid Crystal Display
液晶显示|Liquid Crystal Display
液晶屏|LCD
显示屏|Display
屏蔽线|Shielded Cable
通讯线|Communication Cable
充电器|Charger
逆变器|Inverter
螺钉|Screw
螺丝|Screw
品字插座|IEC-Type Appliance Socket
AC插座|AC Socket
COB面灯|COB Panel Light
面光|Area Light
带端子线|With Terminal Cable
输入功率|Input Power
输出功率|Output Power
欧/澳/英规|EU/AU/UK Specification
英/欧规|UK/EU Specification
欧英规|EU/UK Specification
欧规|EU Specification
欧/美|EU/US
欧韩英澳|EU/KR/UK/AU
中美日欧英澳|CN/US/JP/EU/UK/AU
美日欧|US/JP/EU
科技灰|Technology Gray
黑灰色|Black-Gray
深灰色|Dark Gray
黄绿色|Yellow-Green
黄绿|Yellow-Green
蓝棕|Blue/Brown
红黑|Red/Black
多芯线多种颜色|Multicore Cable, Various Colors
多芯颜色|Multicore, Various Colors
多种颜色|Various Colors
彩色|Multicolor
白色印刷|White Printing
白色|White
黑色|Black
灰色|Gray
棕色|Brown
橙色|Orange
蓝色|Blue
棕|Brown
灰|Gray
乳白色|Milky White
透明|Transparent
金发|Jinfa
台化|Taihua
台华|Taihua
奇美|Chimei
雅淇|Yaqi
沙伯基础|Shabo Jichu
维诺|Weinuo
德米乐|Demile
德赛|Desai
蓝谷|Langu
华琴|Huaqin
联升|Liansheng
联胜|Liansheng
吉力|Jili
高义|Gaoyi
深勤业|Shen Qinye
奎鑫|Kuixin
鑫铠源|Xinkaiyuan
晨旭通|Chen Xutong
铂科|Boke
图为|Tuwei
快鸿|Kuaihong
钧之富|Jun Zhifu
国昱|Guoyu
利信辉|Li Xinhui
盛联|Shenglian
中振|Zhongzhen
东莞连科|Dongguan Lianke
试产|Trial Production
降本|Cost-Reduced
主板供电线磁环三圈|Mainboard Power Cable: Three Turns Through Ferrite Ring
供电线|Power Cable
三圈|Three Turns
正弦波|Sine Wave
防火等级|Flammability Rating
防火|Flammability
耐温|Temperature Resistance
通讯电压|Communication Voltage
额定电压|Rated Voltage
额定电流|Rated Current
限制短路电流|Limited Short-Circuit Current
电压|Voltage
温度|Temperature
自动复位|Automatic Reset
秒|Seconds
以上|or Above
度硅胶|Degree Silicone
度|Degrees
转速|Rotational Speed
要求硬度与008脚垫一致|Hardness Required to Match Foot Pad 008
硅胶导线长|Silicone Wire Length
多芯导线长|Multicore Wire Length
导线长|Wire Length
屏蔽线长|Shielded Cable Length
硅胶导线|Silicone Wire
硅胶面条线配件|Silicone Flat Cable Accessory
硅胶面条线|Silicone Flat Cable
硅胶|Silicone
多芯导线|Multicore Wire
排线|Ribbon Cable
长|Length
连接器|Connector
管型端子|Tubular Terminal
直插端子|Straight Plug-In Terminal
旗形端子|Flag Terminal
圆形端子|Ring Terminal
端子|Terminal
塑壳|Plastic Housing
带锁扣|With Latch
带卡扣|With Clip
带扣|With Latch
双排|Double Row
间距|Pitch
带磁环|With Ferrite Ring
带盖|With Cover
带手感油|With Soft-Touch Coating
三插梅花尾|Three-Pin Cloverleaf Connector
三插头转品字尾|Three-Pin Plug to IEC-Type Connector
三插头转梅花尾|Three-Pin Plug to Cloverleaf Connector
品字尾|IEC-Type Connector
补电线|Charging Cable
外被|Jacket
塑胶绝缘套|Plastic Insulating Sleeve
魔术扎|Hook-and-Loop Strap
新短|New Short
新logo|New logo
品牌logo升级|Brand logo Update
电小二产品|Dian Xiao Er Products
用于|For
带新织唛|With New Woven Label
反包边|Reverse Binding
防溢色|Color-Bleed Prevention
涤纶布料|Polyester Fabric
欧代标贴|EU Representative Label
生产打印|Production Printing
首次使用充电|First-Use Charging
Pro系列|Pro Series
屏|Screen
黑底白光|Black Background, White Backlight
背胶拉手|Adhesive Pull Tab
单面背EVA3M双面胶|EVA3M Double-Sided Adhesive on One Side
单面背EVA双面胶|EVA Double-Sided Adhesive on One Side
背3M双面胶|3M Double-Sided Adhesive Backing
背3M胶|3M Adhesive Backing
双面胶|Double-Sided Adhesive
易撕耳|Easy-Peel Tab
透光度|Light Transmittance
真空镀亮银色|Vacuum-Plated Bright Silver
丝印黑色|Black Screen Printing
表面丝印|Surface Screen Printing
黑色丝印|Black Screen Printing
丝印新增8020标识|Screen Printing With Added 8020 Marking
新增8020|Added 8020
外观面晒纹|Textured Exterior Surface
晒火花纹|Spark-Textured Finish
晒纹|Textured Finish
丝印|Screen Printing
抛光|Polished
铝合金|Aluminum Alloy
铝本色|Natural Aluminum Color
侧面开两个小缺口|Two Small Notches on the Side
碳钢加硬|Hardened Carbon Steel
碳钢|Carbon Steel
加硬|Hardened
镀锌镍合金|Zinc-Nickel Alloy Plating
镀环保彩锌|Environment-Friendly Color Zinc Plating
镀彩锌|Color Zinc Plating
镀锡铜自锁|Tin-Plated Copper, Self-Locking
点耐落胶|Applied Nailuo Threadlocking Adhesive
耐落胶|Nailuo Threadlocking Adhesive
普通机牙|Standard Machine Thread
圆头机牙两组合|Round-Head Machine-Thread Two-Piece Assembly
圆头机牙组合|Round-Head Machine-Thread Assembly
圆头机牙|Round-Head Machine Thread
机牙|Machine Thread
自攻钉|Self-Tapping Screw
自攻|Self-Tapping
十字盘头带介子头|Cross-Recessed Pan Head With Washer Head
十字扁圆头|Cross-Recessed Truss Head
圆头十字槽|Round Head, Cross Recess
平头十字槽|Flat Head, Cross Recess
圆头十字|Round Head, Cross Recess
十字圆头|Cross-Recessed Round Head
三合一组合|Three-in-One Assembly
组件|Assembly
圆头|Round Head
十字头|Cross Recess
十字|Cross Recess
平垫|Flat Washer
弹垫|Spring Washer
尺寸|Dimensions
成品尺寸|Finished Dimensions
外边框尺寸|Outer Frame Dimensions
镜面尺寸|Lens Dimensions
断码|Segmented
材质工艺|Material / Process
材质|Material
成型来料|Supplied Molded
纸浆-干压成型|Pulp, Dry-Press Molded
纸浆|Pulp
厚度|Thickness
厚|Thick
二供|Second Supplier
通用|Universal
共用全降解|Shared, Fully Degradable
共用|Shared
粉灰裱双E坑|Coated Gray-Back Board Laminated to Double E-Flute Corrugated Board
粉灰裱BE坑|Coated Gray-Back Board Laminated to BE-Flute Corrugated Board
粉灰裱|Coated Gray-Back Board Laminated to
牛皮纸裱E坑|Kraft Paper Laminated to E-Flute Corrugated Board
过哑胶裱坑|Matte-Laminated Corrugated Board
单面染黑|Black-Dyed on One Side
黄芯黄底|Yellow Core / Yellow Back
黄芯|Yellow Core
黄底|Yellow Back
底|Back
优牛|Premium Kraft
克|g
耐破|Burst Strength
胶粘|Glued
埋口位|Joint Location
颜色|Color
字体颜色|Text Color
底色|Background Color
单黑印刷|Single-Black Printing
白墨|White Ink
印刷工艺|Printing Process
印刷|Printing
双面印刷|Double-Sided Printing
正反面印刷|Front-and-Back Printing
书纸|Book Paper
双哑粉|Double-Sided Matte-Coated Paper
封面封底|Front and Back Covers
内页|Inner Pages
装订方式|Binding Method
胶装|Perfect Binding
铜版纸不干胶|Coated Paper Self-Adhesive
合成纸不干胶|Synthetic Paper Self-Adhesive
透明可移不干胶|Transparent Removable Self-Adhesive
消银龙|Matte Silver Film (Xiaoyinlong)
不干胶|Self-Adhesive
过哑胶|Matte Lamination
过哑油|Matte Varnish
间隔胶|Patterned Adhesive
专银|Spot Silver
跟色样|Match Color Sample
背胶|Adhesive Backing
可移|Removable
加强粘性|Increased Adhesion
无粘性|Non-Adhesive
好移除|Easy to Remove
注意|Note
要容易移除|Must Be Easy to Remove
不留胶|No Adhesive Residue
雾膜|Matte Film
底部白色部分|White Area at Bottom
黑色泡棉|Black Foam
泡棉|Foam
瓦楞|Corrugated Board
蜂窝板|Honeycomb Board
植绒布|Flocked Fabric
棉|Cotton
工艺|Process
双边车缝线|Sewn on Two Sides
单边开口|Open on One Side
短边开口|Opening on Short Edge
短边开后|Short Edge Opened at Rear
竹纤维|Bamboo Fiber
设备|Equipment
线材|Cables
其他配件|Other Accessories
带电池产品|Products With Batteries
海运|Sea Freight
无文字|No Text
抗紫外线|UV-Resistant
过72H盐雾|Passed 72H Salt Spray
防水|Waterproof
黄铜|Brass
加州65|California 65
认证|Certification
或|or
三插|Three-Pin
三pin|Three-pin
PC片|PC Sheet
AC输出|AC Output
插座|Socket
项目|Project
铜版纸|Coated Paper
环|Ring
黑|Black
转|to
开口配|Open Type, Used With
使用|Use
模式|Mode
含提手|Including Carry Handle
底部隔板|Bottom Divider
条|Strips
小|Small
大|Large
上|Upper
下|Lower
无|None
清洗|Cleaned
与|With
新|New
专|Spot Color
色|Colors
带|With
米|m
'''

GLOSSARY = dict(line.split('|', 1) for line in GLOSSARY_TEXT.strip().splitlines())
TERMS = re.compile('|'.join(re.escape(key) for key in sorted(GLOSSARY, key=len, reverse=True)))
CJK = re.compile(r'[\u3400-\u9fff]')

def translate(text):
    result = TERMS.sub(lambda match: ' ' + GLOSSARY[match[0]] + ' ', text)
    result = result.translate(str.maketrans({'（':'(', '）':')', '，':',', '：':':', '、':'/', '；':';'}))
    result = re.sub(r'\s+', ' ', result).strip()
    result = re.sub(r'\s+([,;:)])', r'\1', result)
    result = re.sub(r'([(])\s+', r'\1', result)
    result = re.sub(r'(?<=[A-Za-z0-9])\(', ' (', result)
    result = re.sub(r'\)(?=[A-Za-z0-9])', ') ', result)
    result = result.replace(' -PCBA', ' PCBA').replace(' -BMS', '-BMS')
    return result

def main():
    source_bytes = SOURCE.read_bytes()
    source = json.loads(source_bytes)
    rows = [row for model in source['models'] for row in model['bom']]
    descriptions = list(dict.fromkeys(row['descriptionZh'] for row in rows))
    entries = [{'descriptionZh': zh, 'descriptionEn': translate(zh)} for zh in descriptions]
    errors = []
    for index, entry in enumerate(entries, 1):
        zh, en = entry['descriptionZh'], entry['descriptionEn']
        if CJK.search(en):
            errors.append(f'{index}: untranslated: {en}')
        # Count each source number, including quantities, dates, model/code digits.
        if Counter(re.findall(r'\d+(?:\.\d+)?', zh)) != Counter(re.findall(r'\d+(?:\.\d+)?', en)):
            errors.append(f'{index}: numeric mismatch: {zh} => {en}')
        # Original ASCII alphanumeric/code runs must survive, in the same case.
        # Added spaces are allowed around translated Chinese fragments only.
        for token, count in Counter(re.findall(r'[A-Za-z0-9]+(?:[-_/.*#=][A-Za-z0-9]+)*', zh)).items():
            if len(re.findall(re.escape(token), en)) < count:
                errors.append(f'{index}: missing source ASCII token {token!r}: {en}')
    example_zh = '车充板-PCBA | HTE078-C-A3（欧韩英澳） RoHS REACH'
    example_en = 'Car Charging PCBA | HTE078-C-A3 (EU/KR/UK/AU) RoHS REACH'
    if dict((e['descriptionZh'],e['descriptionEn']) for e in entries).get(example_zh) != example_en:
        errors.append('Example translation differs from required exact English.')
    if errors:
        raise SystemExit('\n'.join(errors))
    assert len(rows) == 404 and len({r['sku'] for r in rows}) == 242
    assert len(entries) == len(set(e['descriptionZh'] for e in entries)) == 242
    OUTPUT.write_text(json.dumps({'schemaVersion': 1, 'version': 'jackery-bom-en-20261030', 'entries': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    assert SOURCE.read_bytes() == source_bytes
    print(json.dumps({'rowsCovered': len(rows), 'uniqueSku':len({r['sku'] for r in rows}), 'uniqueDescriptions': len(entries), 'untranslatedHan': 0, 'numericMismatches': 0, 'sourceAsciiTokenLosses': 0, 'baseSha256': sha256(source_bytes).hexdigest(), 'outputSha256': sha256(OUTPUT.read_bytes()).hexdigest()}, indent=2))

if __name__ == '__main__':
    main()
