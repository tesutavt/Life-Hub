package com.lifehub.app.ui.screens.learn

// Сгенерировано из client/src/components/KanaTrainerBlock.tsx — те же наборы, что в веб-версии.
data class KanaSet(val id: String, val label: String, val entries: List<Pair<String, String>>)
data class KanaGroup(val title: String, val sets: List<KanaSet>)

val KANA_GROUPS = listOf(
    KanaGroup("Хирагана", listOf(
        KanaSet("hsingle", "гласные", listOf("あ" to "a", "い" to "i", "う" to "u", "え" to "e", "お" to "o")),
        KanaSet("hk", "K", listOf("か" to "ka", "き" to "ki", "く" to "ku", "け" to "ke", "こ" to "ko")),
        KanaSet("hs", "S", listOf("さ" to "sa", "し" to "shi", "す" to "su", "せ" to "se", "そ" to "so")),
        KanaSet("ht", "T", listOf("た" to "ta", "ち" to "chi", "つ" to "tsu", "て" to "te", "と" to "to")),
        KanaSet("hn", "N", listOf("な" to "na", "に" to "ni", "ぬ" to "nu", "ね" to "ne", "の" to "no")),
        KanaSet("hh", "H", listOf("は" to "ha", "ひ" to "hi", "ふ" to "fu", "へ" to "he", "ほ" to "ho")),
        KanaSet("hm", "M", listOf("ま" to "ma", "み" to "mi", "む" to "mu", "め" to "me", "も" to "mo")),
        KanaSet("hy", "Y", listOf("や" to "ya", "ゆ" to "yu", "よ" to "yo")),
        KanaSet("hr", "R", listOf("ら" to "ra", "り" to "ri", "る" to "ru", "れ" to "re", "ろ" to "ro")),
        KanaSet("hw", "W", listOf("わ" to "wa", "を" to "o")),
        KanaSet("hn1", "N", listOf("ん" to "n")),
        KanaSet("hg", "G", listOf("が" to "ga", "ぎ" to "gi", "ぐ" to "gu", "げ" to "ge", "ご" to "go")),
        KanaSet("hz", "Z", listOf("ざ" to "za", "じ" to "ji", "ず" to "zu", "ぜ" to "ze", "ぞ" to "zo")),
        KanaSet("hd", "D", listOf("だ" to "da", "ぢ" to "ji", "づ" to "zu", "で" to "de", "ど" to "do")),
        KanaSet("hb", "B", listOf("ば" to "ba", "び" to "bi", "ぶ" to "bu", "べ" to "be", "ぼ" to "bo")),
        KanaSet("hp", "P", listOf("ぱ" to "pa", "ぴ" to "pi", "ぷ" to "pu", "ぺ" to "pe", "ぽ" to "po")),
    )),
    KanaGroup("Хирагана: сочетания", listOf(
        KanaSet("hdk", "K", listOf("きゃ" to "kya", "きゅ" to "kyu", "きょ" to "kyo")),
        KanaSet("hds", "SH", listOf("しゃ" to "sha", "しゅ" to "shu", "しょ" to "sho")),
        KanaSet("hdc", "CH", listOf("ちゃ" to "cha", "ちゅ" to "chu", "ちょ" to "cho")),
        KanaSet("hdn", "N", listOf("にゃ" to "nya", "にゅ" to "nyu", "にょ" to "nyo")),
        KanaSet("hdh", "H", listOf("ひゃ" to "hya", "ひゅ" to "hyu", "ひょ" to "hyo")),
        KanaSet("hdm", "M", listOf("みゃ" to "mya", "みゅ" to "myu", "みょ" to "myo")),
        KanaSet("hdr", "R", listOf("りゃ" to "rya", "りゅ" to "ryu", "りょ" to "ryo")),
        KanaSet("hdg", "G", listOf("ぎゃ" to "gya", "ぎゅ" to "gyu", "ぎょ" to "gyo")),
        KanaSet("hdj", "J", listOf("じゃ" to "ja", "じゅ" to "ju", "じょ" to "jo")),
        KanaSet("hdj2", "J (2)", listOf("ぢゃ" to "ja", "ぢゅ" to "ju", "ぢょ" to "jo")),
        KanaSet("hdb", "B", listOf("びゃ" to "bya", "びゅ" to "byu", "びょ" to "byo")),
        KanaSet("hdp", "P", listOf("ぴゃ" to "pya", "ぴゅ" to "pyu", "ぴょ" to "pyo")),
    )),
    KanaGroup("Катакана", listOf(
        KanaSet("ksingle", "гласные", listOf("ア" to "a", "イ" to "i", "ウ" to "u", "エ" to "e", "オ" to "o")),
        KanaSet("kk", "K", listOf("カ" to "ka", "キ" to "ki", "ク" to "ku", "ケ" to "ke", "コ" to "ko")),
        KanaSet("ks", "S", listOf("サ" to "sa", "シ" to "shi", "ス" to "su", "セ" to "se", "ソ" to "so")),
        KanaSet("kt", "T", listOf("タ" to "ta", "チ" to "chi", "ツ" to "tsu", "テ" to "te", "ト" to "to")),
        KanaSet("kn", "N", listOf("ナ" to "na", "ニ" to "ni", "ヌ" to "nu", "ネ" to "ne", "ノ" to "no")),
        KanaSet("kh", "H", listOf("ハ" to "ha", "ヒ" to "hi", "フ" to "fu", "ヘ" to "he", "ホ" to "ho")),
        KanaSet("km", "M", listOf("マ" to "ma", "ミ" to "mi", "ム" to "mu", "メ" to "me", "モ" to "mo")),
        KanaSet("ky", "Y", listOf("ヤ" to "ya", "ユ" to "yu", "ヨ" to "yo")),
        KanaSet("kr", "R", listOf("ラ" to "ra", "リ" to "ri", "ル" to "ru", "レ" to "re", "ロ" to "ro")),
        KanaSet("kw", "W", listOf("ワ" to "wa", "ヲ" to "o")),
        KanaSet("kn1", "N", listOf("ン" to "n")),
        KanaSet("kg", "G", listOf("ガ" to "ga", "ギ" to "gi", "グ" to "gu", "ゲ" to "ge", "ゴ" to "go")),
        KanaSet("kz", "Z", listOf("ザ" to "za", "ジ" to "ji", "ズ" to "zu", "ゼ" to "ze", "ゾ" to "zo")),
        KanaSet("kd", "D", listOf("ダ" to "da", "ヂ" to "ji", "ヅ" to "zu", "デ" to "de", "ド" to "do")),
        KanaSet("kb", "B", listOf("バ" to "ba", "ビ" to "bi", "ブ" to "bu", "ベ" to "be", "ボ" to "bo")),
        KanaSet("kp", "P", listOf("パ" to "pa", "ピ" to "pi", "プ" to "pu", "ペ" to "pe", "ポ" to "po")),
    )),
    KanaGroup("Катакана: сочетания", listOf(
        KanaSet("kdk", "K", listOf("キャ" to "kya", "キュ" to "kyu", "キョ" to "kyo")),
        KanaSet("kds", "SH", listOf("シャ" to "sha", "シュ" to "shu", "ショ" to "sho")),
        KanaSet("kdc", "CH", listOf("チャ" to "cha", "チュ" to "chu", "チョ" to "cho")),
        KanaSet("kdn", "N", listOf("ニャ" to "nya", "ニュ" to "nyu", "ニョ" to "nyo")),
        KanaSet("kdh", "H", listOf("ヒャ" to "hya", "ヒュ" to "hyu", "ヒョ" to "hyo")),
        KanaSet("kdm", "M", listOf("ミャ" to "mya", "ミュ" to "myu", "ミョ" to "myo")),
        KanaSet("kdr", "R", listOf("リャ" to "rya", "リュ" to "ryu", "リョ" to "ryo")),
        KanaSet("kdg", "G", listOf("ギャ" to "gya", "ギュ" to "gyu", "ギョ" to "gyo")),
        KanaSet("kdj", "J", listOf("ジャ" to "ja", "ジュ" to "ju", "ジョ" to "jo")),
        KanaSet("kdj2", "J (2)", listOf("ヂャ" to "ja", "ヂュ" to "ju", "ヂョ" to "jo")),
        KanaSet("kdb", "B", listOf("ビャ" to "bya", "ビュ" to "byu", "ビョ" to "byo")),
        KanaSet("kdp", "P", listOf("ピャ" to "pya", "ピュ" to "pyu", "ピョ" to "pyo")),
    )),
)

val KANA_SETS: Map<String, KanaSet> = KANA_GROUPS.flatMap { it.sets }.associateBy { it.id }

/** Допустимые варианты романизации. */
val KANA_REPLACEMENTS = mapOf(
    "o" to listOf("wo"), "chi" to listOf("ci"), "shi" to listOf("si"), "tsu" to listOf("tu"), "zu" to listOf("du"),
    "ji" to listOf("di", "zi"), "fu" to listOf("hu"), "ja" to listOf("dya"), "jo" to listOf("dyo"), "ju" to listOf("dyu"),
)

const val KANA_BASE_URL = "https://djtguide.neocities.org/kana"
