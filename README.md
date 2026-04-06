# Novel Flow

YAML で制御する軽量なノベルゲーム基盤です。背景、立ち絵、名前、本文、選択肢、変数、条件分岐に加えて、主人公名入力、発話者名の位置追従、立ち絵モーションもブラウザ上で動かせます。

GitHub Pages: https://rabbuttz.github.io/NovelGame/

## セットアップ

```bash
npm install
npm run dev
```

本番ビルドは `npm run build` です。

## ディレクトリ

```text
public/
  assets/
    backgrounds/
    characters/
  scenarios/
    demo.yaml
src/
  main.js
  novelGame.js
  style.css
```

## YAML の基本形

```yaml
title: Sample Story
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
    metHeroine: false
  affection:
    heroine: 0

characters:
  heroine:
    name: ヒロイン

start: intro

nodes:
  intro:
    - background: station-evening
    - show:
        character: heroine
        expression: default
        position: right
    - say:
        speaker: heroine
        text: はじめまして。
    - choice:
        options:
          - text: 挨拶する
            set:
              flags.metHeroine: true
              affection.heroine: 1
            goto: greeted
          - text: 立ち去る
            goto: leave

  greeted:
    - if:
        condition: affection.heroine >= 1
        then: good_route
        else: normal_route
```

## 使えるアクション

### `background`

背景を切り替えます。

```yaml
- background: station
```

`backgrounds` に登録した ID、`public/assets/backgrounds/<id>.*` の命名規則、または画像パスを直接指定できます。

### `date`

左上の日付リボンを切り替えます。

```yaml
- date: 8月12日
```

シナリオ全体の初期値としてはルートに `dateLabel` も置けます。

### `show`

立ち絵を表示します。

```yaml
- show:
    character: heroine
    expression: smile
    position: left
```

`position` は `left | center | right` です。
立ち絵は `characters.sprites` に明示指定するか、命名規則から自動解決されます。
`motion` を付けると、表示直後に一回だけ感情モーションを再生できます。

### `hide`

立ち絵を消します。

```yaml
- hide:
    position: left
```

全消ししたい場合は空オブジェクトでも動きます。

```yaml
- hide: {}
```

### `say`

名前と本文を表示します。

```yaml
- say:
    speaker: heroine
    text: 今日は静かですね。
```

地の文は `speaker` を省略できます。
本文と発話者名では `{{player.name}}` のような変数展開が使えます。

### `motion`

表示中の立ち絵に一時的なアニメーションを再生します。

```yaml
- motion:
    character: heroine
    name: 衝撃
```

`character` の代わりに `position` も使えます。現在は `衝撃` `疑問` `喜び` `照れ` `うなずき` が使えます。

### `choice`

選択肢を表示します。各項目で `set` と `goto` が使えます。`condition` を付けると表示条件も付けられます。

```yaml
- choice:
    options:
      - text: 会話する
        condition: flags.metHeroine == true
        goto: talk_more
      - text: 帰る
        goto: ending
```

### `bgm`

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

### `sound`

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

### `set`

変数を更新します。キーはドット区切りでネストを指定できます。

```yaml
- set:
    affection.heroine: 2
    flags.openedSecret: true
```

### `if`

条件で分岐します。

```yaml
- if:
    condition: affection.heroine >= 2
    then: good_route
    else: normal_route
```

対応している比較は `== != > >= < <=` です。演算子を省略すると真偽値判定になります。

### `goto`

別ノードへジャンプします。

```yaml
- goto: ending
```

## 条件式

`condition` では以下の形式が使えます。

- `flags.metHeroine`
- `flags.metHeroine == true`
- `affection.heroine >= 2`
- `route == "secret"`

左辺は常に変数パスです。右辺は数値、文字列、`true`、`false`、`null`、または別の変数パスです。

## 画像差し替え

- 背景の命名規則: `public/assets/backgrounds/<background-id>.<拡張子>`
- 立ち絵の命名規則その1: `public/assets/characters/<character-id>-<expression>.<拡張子>`
- 立ち絵の命名規則その2: `public/assets/characters/<character-id>/<expression>.<拡張子>`
- YAML では背景は `background: <background-id>`、立ち絵は `character: <character-id>` と `expression: <expression>` を書くだけで解決される
- ニュートラル顔は `default` として命名する

例:

```text
public/assets/backgrounds/cafe-day.png
public/assets/characters/sakura-default.png
public/assets/characters/sakura-smile.png
```

```yaml
- background: cafe-day
- show:
    character: sakura
    expression: smile
    position: center
```

PNG、JPG、SVG のどれでも扱えます。

## 最初に触る場所

- シナリオ本体: [public/scenarios/demo.yaml](/C:/Users/Rabbuttz/dev/novelGame2/public/scenarios/demo.yaml)
- エンジン本体: [src/novelGame.js](/C:/Users/Rabbuttz/dev/novelGame2/src/novelGame.js)
- 見た目: [src/style.css](/C:/Users/Rabbuttz/dev/novelGame2/src/style.css)
