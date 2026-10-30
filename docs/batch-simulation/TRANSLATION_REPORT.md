# Jackery BOM English translation report

Prepared: 2026-10-30. Enrichment version: `jackery-bom-en-20261030`.

## Scope and evidence

The translations use only `catalogs/jackery-eu-20261030.json`. No external
translation service, Internet lookup, supplier datasheet, or database was used.
The English is an offline, manually authored translation of both the Chinese
material name and the full specification. Repeated terms and phrases are applied
by `scripts/build-bom-translations.py`; the resulting 242 complete descriptions
were read through against the source descriptions.

The display enrichment is `catalogs/jackery-bom-translations.json`, with exactly:

```json
{
  "schemaVersion": 1,
  "version": "jackery-bom-en-20261030",
  "entries": [
    { "descriptionZh": "exact original description", "descriptionEn": "English translation" }
  ]
}
```

Each `descriptionZh` is the exact original string, including its original
Chinese, whitespace, codes, punctuation, and specification. English is a separate
display field. The intended presentation is English above Chinese; loading and
UI integration are handled separately from this catalog.

| Check | Result |
| --- | --- |
| Physical BOM candidate rows | 404 |
| Unique material SKUs | 242 |
| Unique source descriptions | 242 |
| Translation entries | 242 |
| Source rows covered by exactly one matching description key | 404 / 404 |
| Missing or duplicate translation keys | 0 |
| Empty English values | 0 |
| Remaining Chinese Han characters in English | 0 |
| Per-description numeric-token count differences | 0 |
| Lost source ASCII alphanumeric/code tokens, preserving case and repetitions | 0 |
| Required car-charging example | Exact match |

The current source has **242**, rather than more than 242, unique descriptions.
Deduplication uses the complete `descriptionZh`, never SKU or material name alone.
Both the 261 active physical rows and 143 suspended physical rows are covered.
The ten already excluded product-root/software rows are outside these 404 rows.

## Preservation and reproducibility

Run from the repository root:

```text
python scripts/build-bom-translations.py
```

The script reads the source, builds the translation file, and fails if Han
characters, numeric differences, lost source ASCII tokens, duplicate keys,
unexpected row counts, or a changed required example are found. Numeric checks
include dates, measurements, code digits, and quantities embedded in descriptions.
ASCII checks retain original case, including `ROHS`, `ROSH`, `RoSH`, `REAC`, and
other source spelling variants. These checks establish text preservation, not
technical correctness or supplier approval of the wording.

The source JSON remains byte-for-byte unchanged, preserving original Chinese,
SKU/model/specification fields, `original`, `standardQty`, `active`, and all other
source data. No source catalog digest or catalog version was changed. No database
data was read or written by the translation script.

| Artifact | SHA-256 |
| --- | --- |
| Source `jackery-eu-20261030.json` | `06fe649163e90088c8f1c6ba47f995c990cb8324525bf17b907e8cf2ea8aff44` |
| Translation `jackery-bom-translations.json` | `e36b6de3182c2cb159526205b3c1a8b5ea2f8eb6175c91f7b0b8ec7033df6f25` |

These are the working-copy byte hashes on Windows. The base catalog already has
CRLF line endings, while its Git blob has LF. An independent comparison confirms
that their contents match after line-ending normalization, and Git reports no
base-catalog change. The translation script preserves the original working-copy
source bytes on every run.

## Required example

Original:

```text
车充板-PCBA | HTE078-C-A3（欧韩英澳） RoHS REACH
```

English:

```text
Car Charging PCBA | HTE078-C-A3 (EU/KR/UK/AU) RoHS REACH
```

The other market lists are also translated, including `美日欧` → `US/JP/EU`,
`中美日欧英澳` → `CN/US/JP/EU/UK/AU`, and `欧/美` → `EU/US`. Existing ASCII
market codes are retained as supplied. `降本` is rendered `Cost-Reduced` without
claiming interchangeability, equal performance, or authorization to substitute.

## Faithful literal wording and unresolved source issues

These entries remain faithful to the source. They require source-owner
confirmation before use as engineering, procurement, safety, or compliance
instructions; the translation itself does not resolve them.

| Source wording / example | Translation decision and evidence limit |
| --- | --- |
| `台化` / `台华`, `雅淇`, `德赛`, `维诺`, `图为`, `铂科`, and other Chinese supplier names | Pinyin transliterations are used. They are not verified official English legal or trade names. `台化` and the apparent spelling variant `台华` both render `Taihua`; the original Chinese remains visible and unchanged. |
| `奇美`, `金发`, `沙伯基础` | Rendered `Chimei`, `Jinfa`, `Shabo Jichu`. No manufacturer identity, resin-grade equivalence, or material authorization is inferred. |
| `电小二` | Rendered `Dian Xiao Er`, preserving the source brand as a transliteration. Existing `JAK`, `JACKERY`, and `Jackery` spellings retain their original case. |
| `耐落胶` | Rendered `Nailuo Threadlocking Adhesive`, a literal terminology choice; no particular branded compound, strength, or approved adhesive substitute is specified. |
| `科技灰`, `粉灰裱`, `优牛`, `反包边`, `间隔胶`, `埋口位` | Literal color/packaging/process translations are used, with original grades, layer sequences, sizes, and amounts retained. No additional material grade, process tolerance, or packaging performance is supplied. |
| `消银龙` | Rendered `Matte Silver Film (Xiaoyinlong)`. The translation does not add an unsupported substrate specification. |
| `TPU硅胶`, `TPR/TPE硅胶`, repeated `PC` or repeated silicone descriptions | The source terminology and repetition remain in translation; no material composition conflict is silently corrected. |
| `70度硅胶` | Rendered `70 Degree Silicone`. No Shore scale is supplied or inferred. |
| `温度120度` | Rendered `Temperature 120 Degrees`. No missing temperature unit is supplied. Existing `℃`, `°C`, `°c`, and bare `°` are preserved. |
| Fan `80*25,12DC,0.17A,转速4500` | `Rotational Speed 4500` is translated; `12DC` is not rewritten as a voltage, and no missing speed unit is added. |
| Display `FB001180-VLPW ... 通讯电压` | Rendered `Communication Voltage` with no invented voltage value; the source ends without that value. |
| `AC输出线正极线` / `AC输出线负极线` | Literally `AC Output Positive Wire` / `AC Output Negative Wire`. The original polarity terminology is not converted into line/neutral assertions. |
| `品字尾`, `品字插座`, `三插梅花尾` | Generic `IEC-Type Connector`, `IEC-Type Appliance Socket`, and `Three-Pin Cloverleaf Connector`; no unsupported IEC model number or mating compatibility is added. |
| `短边开后` | Literally `Short Edge Opened at Rear`; the apparently unusual source phrase is not silently repaired to `短边开口`. |
| `8kg.f/cm`, `105°`, `70#`, `50#`, `3*3.5*10`, `120*60mm2.材质`, `021C4.背胶` | Original quantities, units, punctuation-adjacent numbers, and notation are retained rather than corrected or normalized into assumptions. |
| `OPPT模式`, `7PS`, `12DC`, `RoHS REAC`, `ROSH`, `RoSH`, duplicate `ROHS REACH` | Source codes/spelling/repetition are preserved, including apparent typos. `OPPT` is not changed to another control-mode acronym. |
| `过72H盐雾`, `IP67防水`, `加州65`, `UN箱`, `认证`, `防火`, `环保彩锌`, `全降解` | The English reports the source wording only. No independent test result, certification, conformity, transport approval, or environmental claim is established by this translation. |
| `新增8020`, `降本`, differing country/model strings | Added-feature and cost-reduction phrases are translated literally. No performance, replacement-part equivalence, or resolution of source model/version discrepancies is added. |

No Chinese-character exception was needed in English output. Romanized supplier
and brand names are the only non-English lexical carryovers, and the source
Chinese remains available beneath the English for review.
