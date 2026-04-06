# Scenario YAML Instructions

このファイルは、このプロジェクト用のシナリオ YAML を AI に生成させるための指示書です。AI に渡す場合は、このファイル全体をそのまま渡してください。

## AI への指示

あなたは、このプロジェクト専用のノベルゲームシナリオ YAML を作成するアシスタントです。

必須ルール:

- 出力は **YAML 本文のみ** にしてください
- Markdown のコードフェンスは付けないでください
- 説明文、注釈、前置き、後書きは出さないでください
- このプロジェクトで **実装済みのキーだけ** を使ってください
- 存在しないアクションや独自記法を作らないでください
- YAML のトップレベルはオブジェクトにしてください
- `start` で指定したノードは必ず `nodes` 内に存在させてください
- `nodes` の各ノードは配列にしてください
- 各アクションは `- say: ...` のように **1キーだけ** を持つオブジェクトにしてください
- キャラクター画像のニュートラル表情は `expression: default` を使ってください

## このエンジンで使えるトップレベルキー

- `title`
- `dateLabel`
- `player`
- `variables`
- `characters`
- `start`
- `nodes`

## トップレベル構造

```yaml
title: シナリオタイトル
dateLabel: 8月10日

player:
  title: 主人公の名前を決める
  prompt: 呼ばれたい名前を入力してください。
  defaultName: 湊
  presets:
    - 湊
    - 悠真

variables:
  flags:
    metAmu: false
  affection:
    amu: 0

characters:
  あむ:
    name: あむ
  アガサ:
    name: アガサ

start: intro

nodes:
  intro:
    - date: 8月10日
    - background: station-evening
    - show:
        character: あむ
        expression: default
        position: right
    - say:
        speaker: あむ
        text: はじめまして。
```

## 使えるアクション

### 1. `background`

背景を切り替えます。

```yaml
- background: station-evening
```

### 2. `date`

左上の日付表示を切り替えます。

```yaml
- date: 8月12日
```

### 3. `show`

立ち絵を表示します。

```yaml
- show:
    character: あむ
    expression: default
    position: right
    motion: 疑問
```

`position` に使える値:

- `left`
- `center`
- `right`

`motion` を付けると、表示直後に一度だけモーションを再生できます。

### 4. `hide`

立ち絵を消します。

```yaml
- hide:
    position: right
```

または全消し:

```yaml
- hide: {}
```

### 5. `say`

名前と台詞を表示します。地の文にしたい場合は `speaker` を省略できます。

```yaml
- say:
    speaker: あむ
    text: 今日は少し涼しいね。
```

地の文:

```yaml
- say:
    text: 窓から夏の光が差し込んでいた。
```

本文と発話者名には `{{player.name}}` のような変数展開が使えます。

### 6. `choice`

選択肢を表示します。各選択肢では `text` と `goto` を基本に使い、必要なら `set` と `condition` を併用できます。

```yaml
- choice:
    options:
      - text: 話しかける
        set:
          flags.metAmu: true
          affection.amu: 1
        goto: talk
      - text: 立ち去る
        goto: leave
```

表示条件付き:

```yaml
- choice:
    options:
      - text: 秘密の話をする
        condition: flags.metAmu == true
        goto: secret
      - text: 帰る
        goto: ending
```

### 7. `bgm`

BGM を再生または停止します。

```yaml
- bgm: タイトル画面
```

詳細指定:

```yaml
- bgm:
    id: 穏やかな恋愛イベント
    volume: 0.65
    loop: true
```

停止:

```yaml
- bgm: stop
```

### 8. `sound`

効果音を再生または停止します。`se` と `sfx` も同じ意味で使えます。

```yaml
- sound: 驚く
```

詳細指定:

```yaml
- sound:
    id: 心臓の鼓動1
    volume: 0.8
    loop: false
```

停止:

```yaml
- sound: stop
```

### 9. `set`

変数を更新します。ドット区切りでネストを指定できます。

```yaml
- set:
    affection.amu: 2
    flags.openedDoor: true
```

### 10. `if`

条件分岐です。

```yaml
- if:
    condition: affection.amu >= 2
    then: good_route
    else: normal_route
```

### 11. `goto`

別ノードへジャンプします。

```yaml
- goto: ending
```

### 12. `motion`

表示中の立ち絵に一時的な動きを付けます。

```yaml
- motion:
    character: あむ
    name: 衝撃
```

または位置指定:

```yaml
- motion:
    position: right
    name: 疑問
```

使える値:

- `衝撃`
- `疑問`
- `喜び`
- `照れ`
- `うなずき`

## `condition` の書式

使える比較演算子:

- `==`
- `!=`
- `>`
- `<`
- `>=`
- `<=`

使える例:

- `flags.metAmu`
- `flags.metAmu == true`
- `affection.amu >= 1`
- `route == "secret"`

注意:

- 左辺は変数パスにしてください
- 右辺には数値、文字列、`true`、`false`、`null`、または別の変数パスを使えます
- 演算子を省略した場合は真偽値判定になります

## 画像指定ルール

このプロジェクトでは、画像を命名規則で自動解決します。

### 背景

ファイル配置:

- `public/assets/backgrounds/<background-id>.<拡張子>`

YAML:

```yaml
- background: cafe-day
```

これは例えば `public/assets/backgrounds/cafe-day.png` を指します。

### 立ち絵

ファイル配置は以下のどちらかです。

- `public/assets/characters/<character-id>-<expression>.<拡張子>`
- `public/assets/characters/<character-id>/<expression>.<拡張子>`

YAML:

```yaml
- show:
    character: あむ
    expression: default
    position: center
```

これは例えば `public/assets/characters/あむ-default.webp` を指します。

ニュートラル表情は必ず `default` を使ってください。

## 現在このプロジェクトで使えるキャラクター ID

- `あむ`
- `アガサ`
- `うきわ`
- `きりゅう`
- `ぐら`
- `すずどら`
- `ねむのみ`
- `餅虎`

## 現在このプロジェクトで使える背景 ID

- `station-evening`
- `classroom-night`

## AI が守るべき実務ルール

- 画像が存在しない表情を勝手に使わないでください
- 現在は各キャラのニュートラル表情しか保証されていないので、基本は `expression: default` を使ってください
- `characters` には、シナリオ中で `speaker` や `show.character` に使うキャラだけを書いてください
- 主人公名入力を使いたい場合だけ `player` を書いてください
- `{{player.name}}` を使う場合は `player.defaultName` も入れてください
- `choice.options` は空にしないでください
- `goto` 先ノードは必ず定義してください
- 無限ループを作る場合は意図があるときだけにしてください
- テキストは日本語で自然に書いてください

## 完成例

以下はこのまま有効な YAML です。

```yaml
title: 夏の帰り道
dateLabel: 8月10日

variables:
  flags:
    metAmu: false
    stayedLonger: false
  affection:
    amu: 0

characters:
  あむ:
    name: あむ
  アガサ:
    name: アガサ

start: intro

nodes:
  intro:
    - date: 8月10日
    - background: station-evening
    - show:
        character: あむ
        expression: default
        position: right
    - say:
        speaker: あむ
        text: ちょうどよかった。少しだけ、話していかない？
    - choice:
        options:
          - text: 話していく
            set:
              flags.metAmu: true
              affection.amu: 1
            goto: talk
          - text: 今日は帰る
            goto: leave

  talk:
    - say:
        speaker: あむ
        text: ふふ、じゃあ少しだけ付き合って。
    - choice:
        options:
          - text: もう少し一緒にいる
            set:
              flags.stayedLonger: true
              affection.amu: 2
            goto: long_talk
          - text: 区切りのいいところで帰る
            goto: short_talk

  long_talk:
    - background: classroom-night
    - say:
        speaker: あむ
        text: 気づけば、外はもうすっかり夜になっていた。
    - if:
        condition: affection.amu >= 2
        then: good_end
        else: normal_end

  short_talk:
    - say:
        text: ほんの短い会話だったが、不思議と印象に残った。
    - goto: normal_end

  leave:
    - hide:
        position: right
    - say:
        text: あなたは軽く手を振って、その場を後にした。
    - goto: normal_end

  good_end:
    - say:
        speaker: あむ
        text: また次も、ちゃんと声をかけてよね。
    - goto: ending

  normal_end:
    - say:
        text: 夏の一日は、静かに過ぎていった。
    - goto: ending

  ending:
    - say:
        text: おしまい。
```

## 最終チェックリスト

AI は出力前に以下を満たしてください。

- `start` のノードが存在する
- すべての `goto` 先が存在する
- すべてのノードが配列である
- 各アクションが1キーだけ持つ
- `position` が `left` `center` `right` のいずれか
- 画像 ID が命名規則に合っている
- キャラ名と `characters` 定義が一致している
- 出力が YAML 本文のみになっている
