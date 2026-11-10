const API = '/api';

const ATTRIBUTES = ['火', '氷', '雷', '光', '闇', '無'];

// ガチャの解放条件を文にする（例：「○○」で火か氷の属性に投稿）。
// cond = { events:[{ event_number, name }], mode:'all'|'any', attrs:[属性], min_attrs:n, count:'per'|'total' }
// 第○回（event_number）は管理画面だけの通し番号なので、withNo のときだけ付ける
function entryCondText(cond, withNo = false) {
  const evs = (cond.events || []).map(e => `${withNo ? `第${e.event_number}回` : ''}「${e.name}」`);
  const join = (a, all) => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]}${all ? 'と' : 'か'}${a[1]}` : a.join('・');
  const where = evs.length <= 1 ? `${evs[0] || ''}で` : cond.mode === 'any'
    ? `${join(evs, false)}${evs.length > 2 ? 'のどれか' : 'のどちらか'}で`
    : `${join(evs, true)}${evs.length > 2 ? 'のすべて' : 'の両方'}で`;
  const attrs = cond.attrs || [], n = Math.max(1, cond.min_attrs || 1);
  // 合計：イベント×属性の投稿を合わせて数える（例：Aの火・Bの火・Bの闇で3）
  if (cond.count === 'total') {
    const place = evs.length <= 1 ? `${evs[0] || ''}で` : `${join(evs, true)}で`;
    return `${place}${attrs.length ? `${join(attrs, false)}${attrs.length > 2 ? 'のどれか' : ''}の属性に、` : ''}合わせて${n}属性分投稿`;
  }
  let what;
  if (!attrs.length) what = n === 1 ? 'スコアを投稿' : `${n}属性以上に投稿`;
  else if (n === 1) what = attrs.length === 1 ? `${attrs[0]}属性に投稿` : `${join(attrs, false)}${attrs.length > 2 ? 'のどれか' : ''}の属性に投稿`;
  else if (n >= attrs.length) what = `${attrs.join('・')}の${attrs.length}属性すべてに投稿`;
  else what = `${attrs.join('・')}のうち${n}属性以上に投稿`;
  return where + what;
}

// ===== 国際化 (i18n) =====
const _i18n = {
  ja: {
    'dialog.ok':'OK','dialog.cancel':'キャンセル','dialog.back':'戻る',
    'myvid.cancel_ok':'投稿を取り消す',
    'nav.events':'イベント一覧','nav.submit':'スコア投稿','nav.shop':'ショップ',
    'nav.equip':'装備','nav.gacha':'ガチャ','nav.feedback':'お便り箱','nav.my_videos':'動画','nav.charts':'チャート','nav.announcements':'お知らせ','nav.chat':'掲示板',
    'ann.badge':'お知らせ','ann.detail':'詳しく見る','ann.close':'閉じる','ann.next':'次へ','ann.empty':'お知らせはまだありません',
    'chart.my_charts':'マイチャート','chart.new':'+ 新規作成','chart.manage':'管理',
    'chart.board':'チャート掲示板','chart.all_events':'全イベント',
    'chart.search_code':'チャートID検索','chart.search_user':'ユーザー名検索','chart.search_any':'ID・タイトル・ユーザー名で検索','chart.turns':'{n}行','chart.draft':'下書き','chart.sort_new':'新しい順','chart.sort_popular':'人気順','chart.tab_mine':'作ったチャート','chart.tab_fav':'お気に入り','chart.no_favs':'お気に入りはまだありません。チャートの♡を押すとここに入ります',
    'chart.search':'検索','chart.reset':'リセット',
    'chart.no_charts':'チャートがありません',
    'chart.edit':'編集','chart.delete':'削除','chart.delete_confirm':'このチャートを削除しますか？',
    'nav.admin':'管理','nav.account':'アカウント','nav.logout':'ログアウト',
    'nav.login':'ログイン','nav.register':'登録','nav.register_full':'新規登録',
    'nav.admin_badge':'管理者','nav.menu':'メニュー',
    'loading':'読み込み中...','error':'エラーが発生しました','close':'閉じる',
    'save':'保存する','cancel':'キャンセル','send':'送信',
    'status.pending':'承認待ち','status.approved':'承認済み','status.rejected':'却下',
    'attr.火':'火','attr.氷':'氷','attr.雷':'雷','attr.光':'光','attr.闇':'闇','attr.無':'無','attr.斬':'斬','attr.突':'突','attr.打':'打',
    'event.before':'開催前','event.ended':'終了','event.active':'開催中',
    'event.hours_left':'あと{0}時間','event.days_left':'あと{0}日',
    'event.empty':'現在公開中のイベントはありません','event.back':'← イベント一覧',
    'index.title':'ヘブバン ランクボード','index.credit':'制作:',
    'ranking.all_on':'全属性ON','ranking.all_off':'全属性OFF','ranking.submit_btn':'スコア投稿',
    'ranking.col_score':'スコア','ranking.col_title':'称号',
    'ranking.th_rank':'順位','ranking.th_attr':'属性','ranking.th_player':'プレイヤー',
    'ranking.th_score':'スコア','ranking.th_title':'称号',
    'ranking.empty':'選択した属性のスコアデータがありません',
    'ranking.enemies':'ターゲット','ranking.rules':'特殊ルール',
    'ranking.last_updated':'最終更新: ','ranking.anonymous':'匿名','ranking.weak':'弱点',
    'ranking.not_started':'このイベントはまだ投稿期間外です',
    'ranking.period_ended':'このイベントは投稿期間が終了しています',
    'submit.title':'スコア投稿','submit.subtitle':'リザルト画像とともにスコアを投稿してください','submit.back_to_ranking':'← ランキングに戻る',
    'submit.event':'イベント','submit.attr':'属性','submit.image':'リザルト画像',
    'submit.image_hint':'JPG・PNG・WebP対応 / 最大10MB（必須）','submit.image_pick':'タップして画像を選ぶ','submit.attr_hint':'スコアを更新する場合は再投稿してください','submit.err_image':'リザルト画像を選んでください','submit.image_change':'画像を変える','submit.yt_add':'動画URLを追加（任意）','submit.score':'スコア',
    'submit.score_ph':'例: 12345678','submit.btn':'投稿する','submit.btn_loading':'送信中...',
    'submit.select':'選択してください','submit.no_events':'現在投稿できるイベントがありません',
    'submit.err_event':'イベントを選択してください','submit.err_attr':'属性を選択してください',
    'submit.err_score':'スコアを入力してください',
    'submit.anon_title':'匿名で投稿しますか？','submit.anon_desc':'他ユーザーに「匿名」として表示できます。',
    'submit.anon_yes':'匿名で投稿','submit.anon_no':'そのまま投稿',
    'submit.status_title':'このイベントの投稿状況',
    'submit.th_attr':'属性','submit.th_approved':'承認済みスコア',
    'submit.th_pending':'承認待ちスコア','submit.th_status':'状態',
    'videos.title':'動画掲示板','videos.desc':'公開スコアに登録された動画一覧',
    'videos.empty':'動画が登録されていません','videos.btn':'動画掲示板',
    'myvid.title':'動画管理','myvid.submit':'動画を投稿','myvid.submit_feature_desc':'ランキングのスコアを更新せずに動画を投稿する機能です。','myvid.submit_desc':'管理者の承認後に掲示板に掲載されます。',
    'myvid.event':'イベント','myvid.submit_btn':'投稿する','myvid.no_score':'このイベントに承認済みスコアがありません',
    'myvid.pending':'承認待ちの投稿','myvid.my_videos':'掲載中・非表示の動画',
    'myvid.no_pending':'なし','myvid.no_videos':'なし',
    'myvid.approved':'承認済み','myvid.rejected':'却下','myvid.pending_status':'承認待ち',
    'myvid.cancel':'キャンセル','myvid.cancel_confirm':'この投稿をキャンセルしますか？',
    'myvid.hidden':'非表示','myvid.show':'表示する','myvid.hide':'非表示にする',
    'myvid.delete':'削除','myvid.delete_confirm':'この動画を掲示板から削除しますか？',
    'login.title':'ログイン','login.username':'ユーザー名またはログインID','login.password':'パスワード',
    'login.btn':'ログイン','login.btn_loading':'ログイン中...',
    'login.no_account':'アカウントがない方は','login.register_link':'新規登録',
    'login.expired':'セッションの有効期限が切れました。再度ログインしてください。',
    'auth.login_lead':'スコアの投稿やガチャを楽しむにはログインしてください','auth.register_lead':'スコアを投稿してランキングに参加しましょう','auth.or_id':'またはIDとパスワードで','auth.google_note':'Googleならパスワードを覚えなくても始められます','auth.rule_id':'英数字と _ で4〜20文字（あとから変更できます）','auth.next':'次へ','auth.terms_pre':'登録すると','auth.terms':'利用規約','auth.terms_and':'と','auth.privacy':'プライバシーポリシー','auth.terms_post':'に','auth.terms_end':'同意したものとみなします','auth.forgot_pre':'パスワードを忘れた方は','auth.forgot_x':'Xの','auth.forgot_post':'へご連絡ください','auth.network':'通信できませんでした。接続を確かめてもう一度お試しください','auth.pw_show':'パスワードを表示','auth.pw_hide':'パスワードを隠す','auth.copied':'コピーしました','auth.inapp':'アプリ内ブラウザではGoogleログインを使えません。SafariやChromeで開いてください。','auth.copy_url':'URLをコピー','auth.step_account':'アカウント','auth.step_profile':'プロフィール','auth.setup_desc':'ランキングに表示される名前です。あとからプロフィールで変更できます。','auth.copy':'コピー','auth.keep_id':'次回のログインに使います。パスワードと一緒に忘れないよう保管してください。','auth.display_name':'表示名','auth.oshi':'推しキャラクター','auth.optional':'任意','auth.not_set':'選ばない','auth.sns_title':'XとYouTubeを登録する（任意）','auth.sns_note':'ご自身のアカウントで、ヘブバンのコンテンツが含まれるものに限ります。','auth.yt_handle':'YouTubeハンドル','auth.start':'はじめる','auth.saving':'保存中...','auth.name_required':'表示名を入力してください','auth.x_invalid':'X IDは英数字と _ で15文字以内です','auth.yt_invalid':'YouTubeハンドルは英数字と . - _ で3〜30文字です','auth.id_required':'ユーザー名またはログインIDを入力してください','auth.pw_required':'パスワードを入力してください','auth.id_taken':'このIDは使われています。別のIDを入力してください',
    'register.title':'新規登録','register.username':'ユーザー名','register.password':'パスワード',
    'register.login_id':'ログインID','register.login_id_hint':'英数字・_で4〜20文字',
    'register.login_id_desc':'ログイン時に使用するIDです。後からプロフィールで変更できます。',
    'register.oshi':'推しキャラクター（任意）','register.username_hint':'1〜12文字',
    'register.password_hint':'6文字以上','register.oshi_ph':'例: 茅森月歌',
    'register.btn':'登録する','register.btn_loading':'登録中...',
    'register.has_account':'すでにアカウントがある方は','register.login_link':'ログイン',
    'register.setup_title':'表示名を設定','register.setup_desc':'このアプリで表示されるユーザー名を設定してください。',
    'register.setup_id_memo':'（メモしておいてください）','register.setup_username_ph':'表示名（1〜12文字）',
    'register.setup_btn':'登録してログイン',
    'register.login_id_unset':'未設定','register.login_id_profile_desc':'ログイン・リファラルに使用するIDです。他のユーザーには表示されません。',
    'feedback.title':'お便り箱','feedback.subtitle':'機能要望・バグ報告・その他ご意見をお送りください',
    'chat.title':'相談掲示板','chat.subtitle':'属性ごとに相談できる掲示板です','chat.placeholder':'メッセージを入力','chat.empty':'まだメッセージがありません','chat.delete':'削除','chat.room_general':'雑談',
    'feedback.category':'カテゴリ','feedback.body':'内容',
    'feedback.cat_feature':'機能要望','feedback.cat_bug':'バグ報告','feedback.cat_other':'その他',
    'feedback.body_ph':'ご意見・ご要望をご記入ください（1000文字以内）',
    'feedback.char_limit':' / 1000文字','feedback.btn':'送信する','feedback.btn_loading':'送信中...',
    'feedback.disclaimer':'送信内容はユーザー名と共に管理者のみ確認できます',
    'feedback.history':'送信済みのお便り','feedback.empty':'まだ送信したお便りはありません',
    'feedback.err_empty':'内容を入力してください','feedback.admin':'管理者','feedback.you':'あなた',
    'feedback.has_reply':'返信あり','feedback.reply_btn':'返信する',
    'feedback.reply_ph':'返信を入力（1000文字以内）',
    'dist.title_final':'最終結果のお知らせ','dist.sub_final':'以下のイベントの最終結果です',
    'dist.type_final':'最終',
    'bonus.title':'ログインボーナス','bonus.sub':'毎日ログインでポイント獲得！',
    'bonus.claim':'受け取る','bonus.day':'{0}日目','bonus.claimed':'本日分受取済み',
    'bonus.msg':'{0}日目のボーナス','bonus.streak':'{0}日目 達成！','bonus.streak7':' 7日達成！',
    'bonus.received':'受取済','bonus.limit':'上限達成','bonus.special':'特別ボーナス',
    'bonus.remaining':'残り{0}回','bonus.until':'{0}まで',
    'user.oshi':'推し: ','user.title_label':'称号: ','user.joined':'参加: ',
    'user.edit':'プロフィール編集','user.edit_title':'プロフィール編集','user.video_board':'の動画掲示板',
    'user.username':'ユーザー名','user.oshi_field':'推しキャラクター',
    'user.pw_section':'パスワード変更（任意）','user.pw_current':'現在のパスワード',
    'user.pw_new':'新しいパスワード（6文字以上）','user.save':'保存する',
    'user.saved':'保存しました','user.no_scores':'承認済みスコアがありません',
    'user.all_rank':'全属性 {0}位','user.delete':'アカウント削除',
    'user.delete_title':'アカウント削除',
    'user.delete_warn':'この操作は取り消せません。パスワードを入力して確認してください。',
    'user.delete_btn':'削除する','user.back':'← 戻る','user.pw_ph':'パスワードを入力',
    'user.oshi_ph':'例: 茅森月歌',
    'shop.title':'ショップ','shop.equip_title':'装備','shop.tab_oshi':'推し称号',
    'shop.my_points':'所持ポイント','shop.points_hint':'※ポイントはランキングに応じて配布されます',
    'shop.tab_titles':'称号','shop.tab_frames':'フレーム','shop.tab_icons':'アイコン',
    'shop.buy':'購入する','shop.buy_confirm':'で購入しますか？','shop.equip_btn':'装備する','shop.equip_short':'装備','shop.unequip':'外す',
    'shop.owned':'所持済み','shop.equipped_badge':'装備中',
    'shop.no_titles':'購入できる称号がありません',
    'shop.no_frames':'購入できるフレームがありません',
    'shop.frame_cond':'条件','shop.season_reward':'シーズン1位の報酬','shop.season_reward_cond':'{0}のレートランキングで1位になる','shop.season_reward_note':'シーズン終了後、1位の人だけが購入できます','shop.season_reward_won':'{0}で1位を達成','shop.frame_cond_all':'条件をすべて満たすと購入できます','shop.frame_cond_or':'or','shop.frame_locked':'条件未達成','shop.not_enough':'pt不足',
    'shop.frame_cond_rank1':'1位を{0}回','shop.frame_cond_rank':'{0}位以内に{1}回',
    'shop.frame_cond_attr1':'{0}属性で1位を{1}回','shop.frame_cond_attr':'{0}属性で{1}位以内に{2}回',
    'shop.frame_cond_kinds':'{0}種類の属性で{1}位以内','shop.frame_cond_joined':'ランキングに{0}回参加',
    'shop.frame_cond_all_attrs':'1回のイベントで6属性すべてを投稿し、どの属性も次のスコア以上の成績を達成する','shop.frame_cond_all_attrs_row':'属性1位の{0}%以上','etype.score_attack':'スコアアタック','etype.score_attack_ex':'スコアアタックEX','etype.seraph':'遭遇戦','shop.frame_cond_all_attrs_best':'いちばん届いた回','shop.frame_cond_rank_attr1':'{0}属性のスコアで全体1位相当を{1}回','shop.frame_cond_rank_attr':'{0}属性のスコアで全体{1}位相当以内に{2}回',
    'shop.no_my_titles':'所持している称号がありません',
    'shop.no_my_frames':'所持しているフレームがありません',
    'shop.no_icons':'所持しているアイコンがありません',
    'shop.login_to_buy':'ログインして購入',
    'shop.title_award':'称号獲得',
    'shop.icon_none':'なし','shop.no_unit':'部隊なし',
    'shop.sort_unit':'部隊順','shop.sort_acq':'入手順','shop.filter':'絞り込み','shop.filter_rarity':'レア度','shop.filter_unit':'部隊','shop.icon_filter_empty':'条件に合うアイコンはありません',
    'shop.go_gacha':'ガチャでゲットしよう',
    'gacha.title':'キャラアイコン ガチャ',
    'gacha.single':'単発ガチャ','gacha.multi':'10連ガチャ',
    'gacha.multi_hint':'Sレア以上確定',
    'gacha.pool_select':'ガチャを選んでください',
    'gacha.prompt':'ガチャを引いてアイコンをゲット！',
    'gacha.rate_title':'排出率','gacha.pool_btn':'排出対象を見る',
    'gacha.exchange_title':'GP交換',
    'gacha.exchange_desc':'200GP → SSアイコン1枚（選択）',
    'gacha.no_exchange':'交換可能なSSアイコンがありません',
    'gacha.exchange_times':'回','gacha.exchange_open':'交換できます（このガチャを100回以上引きました）','gacha.exchange_locked':'このガチャを{0}回引くと交換できます（あと{1}回）','gacha.exchange_locked_note':'このガチャを{0}回引くと交換できます',
    'gacha.exchange_confirm':'200GPで交換しますか？','gacha.exchange_do':'交換する',
    'gacha.no_icons':'まだアイコンを所持していません',
    'gacha.pool_modal_title':'排出対象アイコン',
    'gacha.back_pool':'ガチャ選択に戻る',
    'gacha.icon_none':'何もつけない',
    'gacha.icons_count':'{0}種のアイコン',
    'gacha.dup_return':'+{0}pt 重複補償',
    'gacha.gp_migrated':'GP補填：過去のガチャ分 {0}GP を付与しました！',
    'gacha.gp_short':'GPが不足しています（現在: {0}GP／必要: {1}GP）',
    'gacha.hours_left':'残り{0}時間','gacha.days_left':'残り{0}日',
    'scope.internal':'内部ランキング','scope.public':'外部ランキング',
    'scope.toggle_hint':'内部/外部切替',
    'scope.submit_internal':'内部ランキングのみ','scope.submit_public':'内部・外部両方',
    'scope.label':'投稿先',
    'scope.gacha_blocked':'ガチャは内部ユーザー限定の機能です',
    'register.internal_pw':'コミュニティパスワード',
    'register.internal_pw_hint':'内部メンバー登録用のパスワードを入力してください',
    'register.internal_badge':'内部メンバー登録',
    'filter.title':'フィルター','filter.default':'デフォルト',
    'filter.reset':'リセット','filter.apply_close':'適用して閉じる','filter.show':'{0}件を表示',
    'filter.event_type':'イベント種類',
    'filter.score_attack':'スコアアタック','filter.seraph':'セラフ遭遇戦演習','filter.score_attack_ex':'スコアタEX',
    'filter.enemy_count':'敵数（スコアアタック・EXのみ）',
    'filter.single':'単体','filter.multi':'複数',
    'filter.weak_attr':'弱点属性','filter.or':'いずれか','filter.and':'すべて含む',
    'filter.destruction_rate':'破壊率','filter.no_match':'条件に一致するイベントがありません',
    'doc.terms':'利用規約','doc.privacy':'プライバシーポリシー',
    'doc.copy_link':'リンクをコピー','doc.copy_done':'コピーしました！','doc.copy_uid':'ユーザーIDをコピー',
    'rn.absent':'不参加','rn.new_season':'{0} 開幕','rn.so_far':'{0} ここまでの推移','rn.prev_result':'{0}の結果','rn.start':'スタート','rn.updates':'今回の更新','rn.season_pos':'シーズン順位','rn.to_ranking':'レートランキング','rn.skip':'タップでスキップ','rn.trend':'シーズン内の推移','rn.season_events':'このシーズンの回','so.open':'開幕','so.live':'開催中','so.reward':'シーズン1位の報酬','so.tap':'タップして進む','so.end':'終了','so.winner':'シーズン1位','so.final_pos':'最終順位','so.pos_of':'位 / {0}人','so.reward_unlocked':'報酬のフレームがショップで購入できるようになりました','rn.seraph_short':'演習',
    'rate.title':'レートランキング','rate.subtitle':'X・Exランクユーザーのレート順','rate.season_events':'{0}回終了','rate.live':'開催中','rate.ended':'終了','rate.winner':'シーズン1位','rate.f_all':'すべて','rate.goal_to':'{0}まで あと<b>{1}</b>','rate.goal_legend':'LEGEND <b>{0}</b>位','rate.position':'{0}位 / {1}人',
    'rate.scope_ext':'外部','rate.scope_int':'内部',
    'rate.my_label':'あなたのレート',
    'rate.th_player':'プレイヤー','rate.th_rank':'ランク','rate.th_rate':'レート',
    'rate.empty':'該当ユーザーがいません','rate.back':'← トップ',
    'rate.btn':'レートランキング',
    'submit.yt_url':'YouTube動画URL（任意）','submit.yt_hint':'YouTubeのURLのみ入力できます',
    'ranking.yt_watch':'YouTube動画を見る',
    'user.x_id':'X (Twitter) ID','user.x_id_optional':'X (Twitter) ID（任意）',
    'user.x_hint':'英数字・アンダースコアのみ（x.com/usernameの形式で表示）',
    'user.x_hint_short':'英数字・アンダースコアのみ',
    'user.x_err':'XのIDは英数字・アンダースコア1〜15文字で入力してください',
    'user.yt_channel_optional':'YouTubeチャンネル',
    'user.yt_channel_hint':'ハンドルのみ',
    'acct.title':'アカウント連携',
    'acct.desc':'IDを登録するとスコアページからあなたのアカウントにアクセスできます。',
    'acct.profile_hint':'プロフィールページからいつでも変更できます。',
    'acct.yt_label':'YouTube チャンネルID',
    'acct.register':'登録',
    'acct.later':'今はしない',
    'acct.yt_err':'YouTube IDは英数字・ピリオド・ハイフン・アンダースコア3〜30文字で入力してください',
    'acct.save_err':'保存に失敗しました',
  },
  zh: {
    'dialog.ok':'OK','dialog.cancel':'取消','dialog.back':'返回',
    'myvid.cancel_ok':'取消投稿',
    'nav.events':'活動列表','nav.submit':'上傳分數','nav.shop':'商店',
    'nav.equip':'裝備','nav.gacha':'轉蛋','nav.feedback':'意見箱','nav.my_videos':'影片','nav.charts':'攻略圖表','nav.announcements':'公告','nav.chat':'留言板',
    'ann.badge':'公告','ann.detail':'查看詳情','ann.close':'關閉','ann.next':'下一則','ann.empty':'目前沒有公告',
    'chart.my_charts':'我的攻略圖表','chart.new':'+ 新建','chart.manage':'管理',
    'chart.board':'攻略圖表看板','chart.all_events':'全部活動',
    'chart.search_code':'搜尋圖表ID','chart.search_user':'搜尋用戶名','chart.search_any':'以ID・標題・用戶名搜尋','chart.turns':'{n}行','chart.draft':'草稿','chart.sort_new':'最新','chart.sort_popular':'人氣','chart.tab_mine':'我的圖表','chart.tab_fav':'收藏','chart.no_favs':'尚無收藏。按下圖表的♡即可加入',
    'chart.search':'搜尋','chart.reset':'重置',
    'chart.no_charts':'沒有攻略圖表',
    'chart.edit':'編輯','chart.delete':'刪除','chart.delete_confirm':'確定刪除此攻略圖表？',
    'nav.admin':'管理','nav.account':'帳戶','nav.logout':'登出',
    'nav.login':'登入','nav.register':'註冊','nav.register_full':'新增帳戶',
    'nav.admin_badge':'管理員','nav.menu':'選單',
    'loading':'載入中...','error':'發生錯誤','close':'關閉',
    'save':'儲存','cancel':'取消','send':'送出',
    'status.pending':'待審核','status.approved':'已核准','status.rejected':'已拒絕',
    'attr.火':'火','attr.氷':'氷','attr.雷':'雷','attr.光':'光','attr.闇':'闇','attr.無':'無','attr.斬':'斬','attr.突':'突','attr.打':'打',
    'event.before':'尚未開始','event.ended':'已結束','event.active':'進行中',
    'event.hours_left':'剩{0}小時','event.days_left':'剩{0}天',
    'event.empty':'目前沒有公開的活動','event.back':'← 活動列表',
    'index.title':'緋染天空 排行榜','index.credit':'製作：',
    'ranking.all_on':'全屬性ON','ranking.all_off':'全屬性OFF','ranking.submit_btn':'上傳分數',
    'ranking.col_score':'分數','ranking.col_title':'稱號',
    'ranking.th_rank':'排名','ranking.th_attr':'屬性','ranking.th_player':'玩家',
    'ranking.th_score':'分數','ranking.th_title':'稱號',
    'ranking.empty':'沒有所選屬性的分數資料',
    'ranking.enemies':'目標','ranking.rules':'特殊規則',
    'ranking.last_updated':'最後更新：','ranking.anonymous':'匿名','ranking.weak':'弱點',
    'ranking.not_started':'此活動尚未開放投稿',
    'ranking.period_ended':'此活動的投稿時間已截止',
    'submit.title':'上傳分數','submit.subtitle':'請附上結果截圖上傳分數','submit.back_to_ranking':'← 返回排行榜',
    'submit.event':'活動','submit.attr':'屬性','submit.image':'結果截圖',
    'submit.image_hint':'支援 JPG・PNG・WebP / 最大 10MB（必填）','submit.image_pick':'點擊選擇圖片','submit.attr_hint':'如需更新分數，請重新投稿','submit.err_image':'請選擇結果圖片','submit.image_change':'更換圖片','submit.yt_add':'新增影片網址（選填）','submit.score':'分數',
    'submit.score_ph':'例：12345678','submit.btn':'投稿','submit.btn_loading':'送出中...',
    'submit.select':'請選擇','submit.no_events':'目前沒有可投稿的活動',
    'submit.err_event':'請選擇活動','submit.err_attr':'請選擇屬性',
    'submit.err_score':'請輸入分數',
    'submit.anon_title':'要匿名投稿嗎？','submit.anon_desc':'可以對其他玩家顯示為「匿名」。',
    'submit.anon_yes':'匿名投稿','submit.anon_no':'直接投稿',
    'submit.status_title':'本活動投稿狀況',
    'submit.th_attr':'屬性','submit.th_approved':'已核准分數',
    'submit.th_pending':'待審核分數','submit.th_status':'狀態',
    'videos.title':'影片看板','videos.desc':'公開分數中登錄的影片列表',
    'videos.empty':'尚無影片','videos.btn':'影片看板',
    'myvid.title':'影片管理','myvid.submit':'投稿影片','myvid.submit_feature_desc':'這是不更新排名分數直接投稿影片的功能。','myvid.submit_desc':'管理員審核後將刊登於影片看板。',
    'myvid.event':'賽事','myvid.submit_btn':'投稿','myvid.no_score':'此賽事無已核准分數',
    'myvid.pending':'待審核投稿','myvid.my_videos':'刊登中・隱藏的影片',
    'myvid.no_pending':'無','myvid.no_videos':'無',
    'myvid.approved':'已核准','myvid.rejected':'已拒絕','myvid.pending_status':'待審核',
    'myvid.cancel':'取消','myvid.cancel_confirm':'確定取消此投稿？',
    'myvid.hidden':'隱藏中','myvid.show':'顯示','myvid.hide':'隱藏',
    'myvid.delete':'刪除','myvid.delete_confirm':'確定從影片看板刪除此影片？',
    'login.title':'登入','login.username':'使用者名稱或登入ID','login.password':'密碼',
    'login.btn':'登入','login.btn_loading':'登入中...',
    'login.no_account':'沒有帳戶嗎？','login.register_link':'新增帳戶',
    'login.expired':'連線已逾時，請重新登入。',
    'auth.login_lead':'請登入以投稿分數或遊玩轉蛋','auth.register_lead':'投稿分數，加入排行榜吧','auth.or_id':'或使用ID與密碼','auth.google_note':'使用Google不必記密碼即可開始','auth.rule_id':'英數字與 _，4～20個字元（之後可變更）','auth.next':'下一步','auth.terms_pre':'註冊即表示您同意','auth.terms':'使用條款','auth.terms_and':'與','auth.privacy':'隱私權政策','auth.terms_post':'','auth.terms_end':'','auth.forgot_pre':'忘記密碼時，','auth.forgot_x':'請透過X聯絡','auth.forgot_post':'','auth.network':'無法連線，請確認網路後再試一次','auth.pw_show':'顯示密碼','auth.pw_hide':'隱藏密碼','auth.copied':'已複製','auth.inapp':'應用程式內瀏覽器無法使用Google登入，請以Safari或Chrome開啟。','auth.copy_url':'複製網址','auth.step_account':'帳戶','auth.step_profile':'個人資料','auth.setup_desc':'這是顯示在排行榜上的名稱，之後可於個人資料變更。','auth.copy':'複製','auth.keep_id':'下次登入時使用，請與密碼一併妥善保管。','auth.display_name':'顯示名稱','auth.oshi':'最愛角色','auth.optional':'選填','auth.not_set':'不選擇','auth.sns_title':'登錄X與YouTube（選填）','auth.sns_note':'僅限您本人且含有HBR內容的帳戶。','auth.yt_handle':'YouTube帳號代碼','auth.start':'開始使用','auth.saving':'儲存中...','auth.name_required':'請輸入顯示名稱','auth.x_invalid':'X ID為英數字與 _，15個字元以內','auth.yt_invalid':'YouTube帳號代碼為英數字與 . - _，3～30個字元','auth.id_required':'請輸入使用者名稱或登入ID','auth.pw_required':'請輸入密碼','auth.id_taken':'此ID已被使用，請輸入其他ID',
    'register.title':'新增帳戶','register.username':'使用者名稱','register.password':'密碼',
    'register.login_id':'登入ID','register.login_id_hint':'英數字・_，4～20個字元',
    'register.login_id_desc':'用於登入的ID，可於個人頁面變更。',
    'register.oshi':'最愛角色（選填）','register.username_hint':'1～12個字元',
    'register.password_hint':'6個字元以上','register.oshi_ph':'例：茅森月歌',
    'register.btn':'註冊','register.btn_loading':'註冊中...',
    'register.has_account':'已有帳戶嗎？','register.login_link':'登入',
    'register.setup_title':'設定顯示名稱','register.setup_desc':'請設定在此應用程式顯示的使用者名稱。',
    'register.setup_id_memo':'（請記下此ID）','register.setup_username_ph':'顯示名稱（1～12個字元）',
    'register.setup_btn':'完成註冊並登入',
    'register.login_id_unset':'未設定','register.login_id_profile_desc':'此ID用於登入及邀請，不對其他使用者顯示。',
    'feedback.title':'意見箱','feedback.subtitle':'歡迎提供功能建議・錯誤回報・其他意見',
    'chat.title':'討論留言板','chat.subtitle':'依屬性分類的討論留言板','chat.placeholder':'輸入訊息','chat.empty':'目前還沒有訊息','chat.delete':'刪除','chat.room_general':'閒聊',
    'feedback.category':'類別','feedback.body':'內容',
    'feedback.cat_feature':'功能建議','feedback.cat_bug':'錯誤回報','feedback.cat_other':'其他',
    'feedback.body_ph':'請填寫您的意見・要求（1000字以內）',
    'feedback.char_limit':' / 1000字','feedback.btn':'送出','feedback.btn_loading':'送出中...',
    'feedback.disclaimer':'送出內容僅管理員可查閱，並附帶您的使用者名稱',
    'feedback.history':'已送出的意見','feedback.empty':'尚未送出任何意見',
    'feedback.err_empty':'請填寫內容','feedback.admin':'管理員','feedback.you':'你',
    'feedback.has_reply':'有回覆','feedback.reply_btn':'回覆',
    'feedback.reply_ph':'請輸入回覆（1000字以內）',
    'dist.title_final':'最終結果通知','dist.sub_final':'以下活動的最終結果',
    'dist.type_final':'最終',
    'bonus.title':'登入獎勵','bonus.sub':'每日登入可獲得點數！',
    'bonus.claim':'領取','bonus.day':'第{0}天','bonus.claimed':'今日已領取',
    'bonus.msg':'第{0}天獎勵','bonus.streak':'第{0}天達成！','bonus.streak7':' 第7天達成！',
    'bonus.received':'已領取','bonus.limit':'已達上限','bonus.special':'特別獎勵',
    'bonus.remaining':'剩餘{0}次','bonus.until':'{0}截止',
    'user.oshi':'最愛角色: ','user.title_label':'稱號: ','user.joined':'加入: ',
    'user.edit':'編輯個人檔案','user.edit_title':'編輯個人檔案','user.video_board':'的影片看板',
    'user.username':'使用者名稱','user.oshi_field':'最愛角色',
    'user.pw_section':'變更密碼（選填）','user.pw_current':'目前密碼',
    'user.pw_new':'新密碼（6個字元以上）','user.save':'儲存',
    'user.saved':'已儲存','user.no_scores':'沒有已核准的分數',
    'user.all_rank':'全屬性 第{0}名','user.delete':'刪除帳戶',
    'user.delete_title':'刪除帳戶',
    'user.delete_warn':'此操作無法撤銷。請輸入密碼確認。',
    'user.delete_btn':'刪除','user.back':'← 返回','user.pw_ph':'請輸入密碼',
    'user.oshi_ph':'例：茅森月歌',
    'shop.title':'商店','shop.equip_title':'裝備','shop.tab_oshi':'推し稱號',
    'shop.my_points':'擁有點數','shop.points_hint':'※點數依排名發放',
    'shop.tab_titles':'稱號','shop.tab_frames':'外框','shop.tab_icons':'圖示',
    'shop.buy':'購買','shop.buy_confirm':'購買嗎？','shop.equip_btn':'裝備','shop.equip_short':'裝備','shop.unequip':'卸除',
    'shop.owned':'已擁有','shop.equipped_badge':'裝備中',
    'shop.no_titles':'沒有可購買的稱號',
    'shop.no_frames':'沒有可購買的外框',
    'shop.frame_cond':'條件','shop.season_reward':'賽季第1名獎勵','shop.season_reward_cond':'在{0}評分排行榜獲得第1名','shop.season_reward_note':'賽季結束後僅第1名可購買','shop.season_reward_won':'於{0}獲得第1名','shop.frame_cond_all':'滿足所有條件即可購買','shop.frame_cond_or':'or','shop.frame_locked':'尚未達成條件','shop.not_enough':'點數不足',
    'shop.frame_cond_rank1':'獲得第1名{0}次','shop.frame_cond_rank':'進入前{0}名{1}次',
    'shop.frame_cond_attr1':'{0}屬性獲得第1名{1}次','shop.frame_cond_attr':'{0}屬性進入前{1}名{2}次',
    'shop.frame_cond_kinds':'{0}種屬性進入前{1}名','shop.frame_cond_joined':'參加排名{0}次',
    'shop.frame_cond_all_attrs':'單次活動中投稿全部6種屬性，且每種屬性皆達成以下分數以上的成績','shop.frame_cond_all_attrs_row':'屬性第1名的{0}%以上','etype.score_attack':'分數挑戰','etype.score_attack_ex':'分數挑戰EX','etype.seraph':'遭遇戰','shop.frame_cond_all_attrs_best':'最接近的一次','shop.frame_cond_rank_attr1':'{0}屬性分數達總排名第1名水準{1}次','shop.frame_cond_rank_attr':'{0}屬性分數達總排名前{1}名水準{2}次',
    'shop.no_my_titles':'沒有擁有的稱號',
    'shop.no_my_frames':'沒有擁有的外框',
    'shop.no_icons':'沒有擁有的圖示',
    'shop.login_to_buy':'登入後購買',
    'shop.title_award':'稱號獲得',
    'shop.icon_none':'無','shop.no_unit':'無部隊',
    'shop.sort_unit':'部隊順','shop.sort_acq':'入手順','shop.filter':'篩選','shop.filter_rarity':'稀有度','shop.filter_unit':'部隊','shop.icon_filter_empty':'沒有符合條件的圖示',
    'shop.go_gacha':'去轉蛋獲取吧',
    'gacha.title':'角色圖示 轉蛋',
    'gacha.single':'單抽','gacha.multi':'十連抽',
    'gacha.multi_hint':'S稀以上保底',
    'gacha.pool_select':'請選擇轉蛋',
    'gacha.prompt':'抽轉蛋取得圖示！',
    'gacha.rate_title':'抽取機率','gacha.pool_btn':'查看收錄內容',
    'gacha.exchange_title':'GP兌換',
    'gacha.exchange_desc':'200GP → SS圖示1枚（自選）',
    'gacha.no_exchange':'沒有可兌換的SS圖示',
    'gacha.exchange_times':'次','gacha.exchange_open':'可以兌換（此轉蛋已抽100次以上）','gacha.exchange_locked':'此轉蛋抽{0}次後即可兌換（還差{1}次）','gacha.exchange_locked_note':'此轉蛋抽{0}次後即可兌換',
    'gacha.exchange_confirm':'要用200GP兌換嗎？','gacha.exchange_do':'兌換',
    'gacha.no_icons':'尚未擁有任何圖示',
    'gacha.pool_modal_title':'收錄圖示',
    'gacha.back_pool':'返回轉蛋選擇',
    'gacha.icon_none':'不裝備',
    'gacha.icons_count':'{0}種圖示',
    'gacha.dup_return':'+{0}pt 重複補償',
    'gacha.gp_migrated':'GP補填：過去轉蛋 {0}GP 已補發！',
    'gacha.gp_short':'GP不足（目前: {0}GP／需要: {1}GP）',
    'gacha.hours_left':'剩{0}小時','gacha.days_left':'剩{0}天',
    'scope.internal':'內部排行榜','scope.public':'外部排行榜',
    'scope.toggle_hint':'切換內部/外部',
    'scope.submit_internal':'僅內部排行榜','scope.submit_public':'內部・外部皆投稿',
    'scope.label':'投稿目標',
    'scope.gacha_blocked':'轉蛋為內部用戶專屬功能',
    'register.internal_pw':'社群密碼',
    'register.internal_pw_hint':'請輸入內部成員專用密碼',
    'register.internal_badge':'內部成員註冊',
    'filter.title':'篩選','filter.default':'預設',
    'filter.reset':'重置','filter.apply_close':'套用並關閉','filter.show':'顯示 {0} 個',
    'filter.event_type':'活動類型',
    'filter.score_attack':'分數挑戰','filter.seraph':'熾天使遭遇戰演習','filter.score_attack_ex':'分數挑戰EX',
    'filter.enemy_count':'敵人數量（僅限分數挑戰・EX）',
    'filter.single':'單體','filter.multi':'複數',
    'filter.weak_attr':'弱點屬性','filter.or':'任一','filter.and':'全部包含',
    'filter.destruction_rate':'破壞率','filter.no_match':'沒有符合條件的活動',
    'doc.terms':'使用條款','doc.privacy':'隱私政策',
    'doc.copy_link':'複製連結','doc.copy_done':'已複製！','doc.copy_uid':'複製用戶ID',
    'rn.absent':'未參加','rn.new_season':'{0} 開幕','rn.so_far':'{0} 目前為止的走勢','rn.prev_result':'{0}的結果','rn.start':'起始','rn.updates':'本次更新','rn.season_pos':'賽季名次','rn.to_ranking':'評分排行榜','rn.skip':'點擊跳過','rn.trend':'賽季走勢','rn.season_events':'本賽季的場次','so.open':'開幕','so.live':'進行中','so.reward':'賽季第1名獎勵','so.tap':'點擊繼續','so.end':'結束','so.winner':'賽季第1名','so.final_pos':'最終名次','so.pos_of':'名 / {0}人','so.reward_unlocked':'獎勵外框已可在商店購買','rn.seraph_short':'演習',
    'rate.title':'評分排行榜','rate.subtitle':'X・Ex等級玩家評分排名','rate.season_events':'已結束{0}場','rate.live':'進行中','rate.ended':'已結束','rate.winner':'賽季第1名','rate.f_all':'全部','rate.goal_to':'距離{0}還差<b>{1}</b>','rate.goal_legend':'LEGEND 第<b>{0}</b>名','rate.position':'第{0}名 / {1}人',
    'rate.scope_ext':'外部','rate.scope_int':'內部',
    'rate.my_label':'你的評分',
    'rate.th_player':'玩家','rate.th_rank':'等級','rate.th_rate':'評分',
    'rate.empty':'沒有符合條件的玩家','rate.back':'← 首頁',
    'rate.btn':'評分排行榜',
    'submit.yt_url':'YouTube影片網址（選填）','submit.yt_hint':'僅限YouTube網址',
    'ranking.yt_watch':'觀看YouTube影片',
    'user.x_id':'X (Twitter) ID','user.x_id_optional':'X (Twitter) ID（選填）',
    'user.x_hint':'僅限英數字・底線（以x.com/username格式顯示）',
    'user.x_hint_short':'僅限英數字・底線',
    'user.x_err':'X的ID請輸入英數字・底線1〜15個字元',
    'user.yt_channel_optional':'YouTube頻道',
    'user.yt_channel_hint':'僅限handle',
    'acct.title':'帳戶連結',
    'acct.desc':'設定ID後，可從分數頁面前往您的帳戶。',
    'acct.profile_hint':'可隨時在個人資料頁面變更。',
    'acct.yt_label':'YouTube 頻道ID',
    'acct.register':'登錄',
    'acct.later':'下次再說',
    'acct.yt_err':'YouTube ID請輸入英數字・句點・連字號・底線3〜30個字元',
    'acct.save_err':'儲存失敗',
  }
};

function getLang() { return localStorage.getItem('lang') || 'ja'; }
function setLang(lang) { localStorage.setItem('lang', lang); location.reload(); }
function t(key, ...args) {
  const lang = getLang();
  const dict = _i18n[lang] || _i18n.ja;
  let str = (key in dict) ? dict[key] : ((_i18n.ja[key]) ?? key);
  args.forEach((a, i) => { str = str.replace(`{${i}}`, a); });
  return str;
}
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.documentElement.lang = getLang() === 'zh' ? 'zh-TW' : 'ja';
}

// ===== 認証 =====
function getToken() { return localStorage.getItem('token'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}
function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// ページロード時にDBから最新のis_internalを同期
if (getToken()) {
  fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' } })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        const user = getUser();
        if (user && (user.is_internal !== data.is_internal || user.user_code !== data.user_code
            || (user.icon_url || null) !== (data.equipped_icon_url || null) || (user.icon_rarity || null) !== (data.equipped_icon_rarity || null))) {
          user.is_internal = data.is_internal;
          if (data.user_code) user.user_code = data.user_code;
          user.icon_url = data.equipped_icon_url || null;
          user.icon_rarity = data.equipped_icon_rarity || null;
          localStorage.setItem('user', JSON.stringify(user));
          updateNavAvatar(user);
        }
      }
    })
    .catch(() => {});
}

function authHeaders() {
  const tk = getToken();
  return tk ? { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function _handleAuthError(res, data) {
  if ((res.status === 401 || res.status === 403) && getToken()) {
    clearAuth();
    location.href = `/login.html?expired=1&redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return true;
  }
  return false;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, { headers: authHeaders(), ...options });
  const data = await res.json();
  if (!res.ok) {
    if (_handleAuthError(res, data)) return;
    throw new Error(data.error || t('error'));
  }
  return data;
}

async function apiFormFetch(path, formData, method = 'POST') {
  const token = getToken();
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(API + path, { method, headers, body: formData });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    if (_handleAuthError(res, data)) return;
    throw new Error(data.error || t('error'));
  }
  return data;
}

function getLangLocale() { return getLang() === 'zh' ? 'zh-TW' : 'ja-JP'; }

function formatScore(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString(getLangLocale());
}

function formatDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString(getLangLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

function showAlert(container, message, type = 'error') {
  const el = document.querySelector(container);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${escHtml(message)}</div>`;
}

// 絞り込みのシート（スマホで下から出る .fl-modal）は、下に引くと閉じる。
// 少し引いただけなら元に戻す。中身を下にスクロールしている途中は閉じる操作にしない。閉じるのは .fl-x を押したのと同じ
function initSheetSwipe(modal) {
  const box = modal.querySelector('.fl-box');
  if (!box || box._swipe) return;
  box._swipe = true;
  const body = box.querySelector('.fl-body');
  let y0 = null, dy = 0, t0 = 0, drag = false;
  box.addEventListener('touchstart', e => {
    y0 = null;
    if (!matchMedia('(max-width: 640px)').matches || e.target.closest('input')) return;
    if (body && body.contains(e.target) && body.scrollTop > 0) return;
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); drag = false;
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!drag) {
      if (dy < -6) { y0 = null; return; }
      if (dy <= 6) return;
      drag = true;
      box.style.animation = 'none';
      box.style.transition = 'none';
    }
    e.preventDefault();
    box.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    if (!drag) return;
    const speed = dy / Math.max(1, Date.now() - t0);
    box.style.transition = 'transform 0.22s cubic-bezier(.2,.8,.3,1)';
    if (dy > Math.min(120, box.offsetHeight * 0.3) || (dy > 30 && speed > 0.6)) {
      box.style.transform = 'translateY(100%)';
      setTimeout(() => {
        modal.querySelector('.fl-x')?.click();
        box.style.transition = box.style.transform = box.style.animation = '';
      }, 220);
    } else {
      box.style.transform = '';
    }
  };
  box.addEventListener('touchend', end);
  box.addEventListener('touchcancel', end);
}
function initSheetSwipes() { document.querySelectorAll('.fl-modal').forEach(initSheetSwipe); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSheetSwipes);
else initSheetSwipes();

// 画面の上に数秒だけ出すお知らせ。type は 'success'（既定）か 'error'。押すとすぐ消える
let _toastTimer = null;
function showToast(message, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.addEventListener('click', () => el.classList.remove('show'));
    document.body.appendChild(el);
  }
  const ico = type === 'error'
    ? '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v9" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><circle cx="12" cy="19.5" r="2" fill="#fff"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.innerHTML = `<span class="toast-ico">${ico}</span><span class="toast-msg">${escHtml(message)}</span>`;
  void el.offsetWidth; // 出し直しでも毎回すべり込ませる
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), type === 'error' ? 4000 : 2500);
}

function clearAlert(container) {
  const el = document.querySelector(container);
  if (el) el.innerHTML = '';
}

function thumbUrl(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace(/\/upload\/[^/]+\//, '/upload/q_60,f_auto,w_300,c_limit/');
}

// チャート用アイコン（正方形に切り抜いた小さい画像）
function chartIconUrl(url, size = 96) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace(/\/upload\/(?:[^/]+\/)?(v\d+\/)/, `/upload/q_auto,f_auto,w_${size},h_${size},c_fill/$1`);
}

// チャートのお気に入り（♡）のアイコン
function heartSvg(filled, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>`;
}

// チャートのカード（掲示板・マイチャートで共通）。actions を渡すとカード右下にボタンを置く
function chartCardHTML(c, { actions = '', showDraft = false } = {}) {
  const ATTR_COLOR = { '火': 'var(--fire)', '氷': 'var(--ice)', '雷': 'var(--thunder)', '光': 'var(--light)', '闇': 'var(--dark)', '無': 'var(--none)' };
  const bySlot = {};
  (c.members || []).forEach(m => { bySlot[m.slot] = m; });
  const faces = [1, 2, 3, 4, 5, 6].map(slot => {
    const m = bySlot[slot];
    if (!m) return '<div class="chart-face"><div class="ph"></div><span>&nbsp;</span></div>';
    const short = m.abbreviation || m.name;
    const img = m.icon_url
      ? `<img src="${escHtml(chartIconUrl(m.icon_url, 104))}" alt="${escHtml(m.name)}" title="${escHtml(m.name)} / ${escHtml(m.style)} ${m.refine_count}凸" loading="lazy">`
      : `<div class="ph" title="${escHtml(m.name)}">${escHtml(short.charAt(0))}</div>`;
    return `<div class="chart-face">${img}<span>${escHtml(m.style || short)}</span></div>`;
  }).join('');
  return `
    <div class="chart-card" style="--ac:${ATTR_COLOR[c.attribute] || 'var(--border)'}">
      <a class="chart-card-link" href="/chart-view.html?id=${c.id}" aria-label="${escHtml(c.title)}"></a>
      <div class="chart-card-top">
        <span class="attr-badge attr-${escHtml(c.attribute)} small" style="flex-shrink:0">${t('attr.' + c.attribute) || c.attribute}</span>
        <span class="chart-card-title">${escHtml(c.title)}</span>
        ${showDraft && !c.is_public ? `<span class="chart-draft-badge">${t('chart.draft')}</span>` : ''}
        <span class="chart-code-badge">${escHtml(c.chart_code)}</span>
      </div>
      <div class="chart-faces">${faces}</div>
      <div class="chart-card-meta">
        <span class="user">${escHtml(c.username)}</span>
        <span>${new Date(c.created_at).toLocaleDateString('ja-JP')}</span>
        <span>${t('chart.turns').replace('{n}', c.turn_count || 0)}</span>
        ${c.is_public ? `<span class="chart-fav${c.favorited ? ' on' : ''}">${heartSvg(c.favorited, 12)}${c.favorite_count || 0}</span>` : ''}
        ${actions ? `<span class="chart-card-actions">${actions}</span>` : ''}
      </div>
    </div>`;
}

// フレームの見本（ランキングの1行に枠を付けた形）。name・iconUrl は見本に出す名前とアイコン
function frameSampleHtml(cssClass, name, iconUrl) {
  const label = name || 'Player';
  const avatar = iconUrl ? `<img src="${escHtml(iconUrl)}" alt="">` : escHtml(label.slice(0, 1));
  return `<div class="frame-sample ${escHtml(cssClass)}"><i class="fs-orn"></i><span class="fs-rank">1</span><span class="fs-avatar">${avatar}</span><span class="fs-name">${escHtml(label)}</span><span class="fs-score">3,840,220</span></div>`;
}

// 管理者マーク（赤い縁のピルに、白いチェックの入った盾と ADMIN）
function adminBadgeHtml() {
  const label = escHtml(t('nav.admin_badge'));
  return `<span class="nav-admin-badge" role="img" aria-label="${label}" title="${label}"><svg width="12" height="13" viewBox="0 0 24 26" aria-hidden="true"><path d="M12 1l10 4v7c0 6.5-4.3 11.6-10 13-5.7-1.4-10-6.5-10-13V5z" fill="currentColor"/><path d="M7.5 13.2l3.1 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span aria-hidden="true">ADMIN</span></span>`;
}

// ランキングのフレームはセルから表の幅まで伸ばすので、表の幅（--rw）と1つ目のセルの幅（--c1）を入れておく
// 画像や文字の読み込みで列の幅があとから変わるので、表と1つ目のセルの大きさが変わるたびに測り直す
const _frameRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
  cancelAnimationFrame(window._fitFrameRaf);
  window._fitFrameRaf = requestAnimationFrame(measureFrameRows);
}) : null;
const _frameWatched = new WeakSet();
function measureFrameRows() {
  document.querySelectorAll('.ranking-table').forEach(t => {
    const fr = t.querySelector('tr.has-frame');
    if (!fr) return;
    t.style.setProperty('--rw', t.offsetWidth + 'px');
    t.style.setProperty('--c1', (fr.cells[0] ? fr.cells[0].offsetWidth : 0) + 'px');
  });
}
function fitFrameRows() {
  measureFrameRows();
  if (!_frameRO) return;
  document.querySelectorAll('.ranking-table').forEach(t => {
    const fr = t.querySelector('tr.has-frame');
    if (!fr) return;
    for (const el of [t, fr.cells[0]]) if (el && !_frameWatched.has(el)) { _frameWatched.add(el); _frameRO.observe(el); }
  });
}
window.addEventListener('resize', () => { clearTimeout(window._fitFrameT); window._fitFrameT = setTimeout(fitFrameRows, 100); });

function mediumUrl(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace(/\/upload\/[^/]+\//, '/upload/q_auto,f_auto,w_640,c_limit/');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrBadge(attr, small = false) {
  return `<span class="attr-badge attr-${escHtml(attr)}${small ? ' small' : ''}">${escHtml(t('attr.' + attr) || attr)}</span>`;
}

function statusBadge(status) {
  const labels = { pending: t('status.pending'), approved: t('status.approved'), rejected: t('status.rejected') };
  return `<span class="status-badge status-${status}">${labels[status] || status}</span>`;
}

// ===== ナビアイコン =====
const NAV_ICONS = {
  submit:   `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V4M5 7l3-3 3 3"/><line x1="3" y1="13" x2="13" y2="13"/></svg>`,
  gacha:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="7.5" height="10" rx="1.4" transform="rotate(-12 5.75 8.5)"/><rect x="6.5" y="2.5" width="7.5" height="10" rx="1.4" fill="var(--nm-ico-bg, #1a1734)"/><path d="M10.25 5.6l.6 1.2 1.3.2-.95.9.2 1.3-1.15-.6-1.15.6.2-1.3-.95-.9 1.3-.2z" fill="currentColor" stroke="none"/></svg>`,
  charts:   `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="1"/><line x1="2" y1="6" x2="14" y2="6"/><line x1="2" y1="10" x2="14" y2="10"/><line x1="7" y1="2" x2="7" y2="14"/></svg>`,
  announcements: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6v4l2 .5V13a1 1 0 0 0 1 1h1v-3.2"/><path d="M2 6l9-3v10l-9-3V6z"/><path d="M11 5.5c1.2.6 2 1.6 2 2.5s-.8 1.9-2 2.5"/></svg>`,
  videos:   `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M6.5 7.5l3 1.5-3 1.5V7.5z" fill="currentColor" stroke="none"/></svg>`,
  shop:     `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h10l-1.5 7.5h-7z"/><path d="M6 5c0-1.1.9-2 2-2s2 .9 2 2"/></svg>`,
  equip:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2c0 1.1-.9 2-2 2L2 5.5l1.5 2L5 7v7h6V7l1.5.5L14 5.5 12 4c-1.1 0-2-.9-2-2"/><line x1="6" y1="2" x2="10" y2="2"/></svg>`,
  feedback: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="9" rx="1"/><path d="M2 5l6 4 6-4"/></svg>`,
  chat:     `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h12v8H5l-3 3V3z"/></svg>`,
  account:  `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>`,
  admin:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1"/></svg>`,
  logout:   `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3H3v10h3"/><path d="M10 5l3 3-3 3M13 8H7"/></svg>`,
  login:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h3v10h-3"/><path d="M6 11l-3-3 3-3M3 8h6"/></svg>`,
  register: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="5.5" r="2.5"/><path d="M2 13c0-2.8 2.2-5 5-5"/><path d="M12 9v4M10 11h4"/></svg>`,
};
// サイトのロゴ（表彰台＋RB）。favicon.svg と同じ絵
const NAV_LOGO_MARK = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="8.6" y="3.5" width="6.8" height="17" rx="1.1" fill="#fff"/><rect x="1.4" y="8.5" width="6.6" height="12" rx="1.1" fill="#ffd0d6"/><rect x="16" y="11.5" width="6.6" height="9" rx="1.1" fill="#ffd0d6"/><path d="M11.90 18.20L10.39 18.20L8.43 15.86L10.34 15.86L11.90 17.70L11.90 18.20ZM6.60 18.20L5.14 18.20L5.14 11.44L10.51 11.44Q10.89 11.44 11.21 11.63Q11.52 11.82 11.71 12.14Q11.91 12.46 11.91 12.83L11.91 12.83L11.91 14.58Q11.91 14.96 11.71 15.28Q11.52 15.60 11.21 15.78Q10.89 15.97 10.51 15.97L10.51 15.97L6.60 15.98L6.60 18.20ZM6.60 14.51L6.60 14.51L10.43 14.51Q10.43 14.51 10.43 14.51Q10.43 14.51 10.43 14.51L10.43 14.51L10.43 12.90Q10.43 12.90 10.43 12.90Q10.43 12.90 10.43 12.90L10.43 12.90L6.60 12.90Q6.60 12.90 6.60 12.90Q6.60 12.90 6.60 12.90L6.60 12.90L6.60 14.51Q6.60 14.51 6.60 14.51Q6.60 14.51 6.60 14.51ZM12.52 18.20L12.52 18.20L12.52 11.43L17.64 11.43Q18.01 11.43 18.33 11.62Q18.64 11.81 18.83 12.12Q19.03 12.44 19.03 12.82L19.03 12.82L19.03 14.09Q19.03 14.21 19.01 14.32Q19.00 14.43 18.96 14.52L18.96 14.52Q19.10 14.70 19.20 14.94Q19.29 15.17 19.29 15.41L19.29 15.41L19.29 16.81Q19.29 17.18 19.10 17.50Q18.90 17.82 18.59 18.01Q18.27 18.20 17.89 18.20L17.89 18.20L12.52 18.20ZM13.98 16.73L13.98 16.73L17.81 16.73Q17.81 16.73 17.81 16.73Q17.81 16.73 17.81 16.73L17.81 16.73L17.81 15.49Q17.81 15.49 17.81 15.49Q17.81 15.49 17.81 15.49L17.81 15.49L13.98 15.49Q13.98 15.49 13.98 15.49Q13.98 15.49 13.98 15.49L13.98 15.49L13.98 16.73Q13.98 16.73 13.98 16.73Q13.98 16.73 13.98 16.73ZM13.98 14.03L13.98 14.03L17.55 14.03Q17.55 14.03 17.55 14.03Q17.55 14.03 17.55 14.03L17.55 14.03L17.55 12.90Q17.55 12.90 17.55 12.90Q17.55 12.90 17.55 12.90L17.55 12.90L13.98 12.90Q13.98 12.90 13.98 12.90Q13.98 12.90 13.98 12.90L13.98 12.90L13.98 14.03Q13.98 14.03 13.98 14.03Q13.98 14.03 13.98 14.03Z" fill="#fff" stroke="#c2304f" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke"/></svg>';

function ni(key) {
  return NAV_ICONS[key] ? `<i class="nvi">${NAV_ICONS[key]}</i>` : '';
}

// ===== 汎用アイコン（空状態・ボタン・バッジ用。絵文字の代わりにナビと同じ線画で統一） =====
const UI_ICON_PATHS = {
  trophy:    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 14v3M8.5 20.5h7L15 17H9z"/>',
  megaphone: '<path d="M3 10v4l3 .8V19a1 1 0 0 0 1 1h1.5v-4.7"/><path d="M3 10l13-4.5v13L3 14z"/><path d="M16 8.5c1.8.9 3 2.2 3 3.5s-1.2 2.6-3 3.5"/>',
  search:    '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  list:      '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  chart:     '<path d="M4 20h16"/><rect x="6" y="11" width="3" height="6"/><rect x="11" y="6" width="3" height="11"/><rect x="16" y="13" width="3" height="4"/>',
  sparkle:   '<path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z"/><path d="M19 3v4M17 5h4"/>',
  capsule:   '<circle cx="12" cy="12" r="8"/><path d="M4 12h5M15 12h5"/><circle cx="12" cy="12" r="3"/>',
  wrench:    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.4-.4-2.6z"/>',
  check:     '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  calendar:  '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  user:      '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  bag:       '<path d="M5 8h14l-1.6 12H6.6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  gift:      '<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M5.5 13v7h13v-7M12 9v11"/><path d="M12 9C10.5 6 7 5.5 7 7.5S10 9 12 9zM12 9c1.5-3 5-3.5 5-1.5S14 9 12 9z"/>',
  play:      '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  gear:      '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
};
function uiIcon(name, size = 40) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICON_PATHS[name]}</svg>`;
}
// 管理画面のページ移動の帯：<div class="admin-nav" data-current="scores"></div> を置けば中身を作る。
// 承認待ちのスコアとお便りの未読は数を添える。スマホでは横にスクロールし、今のページが見える位置にする
const ADMIN_PAGES = [
  { key: 'scores', href: '/admin_scores.html', label: 'スコア', icon: 'check', desc: '投稿の承認・スコア一覧' },
  { key: 'events', href: '/admin_events.html', label: 'イベント', icon: 'calendar', desc: 'イベントと敵の編集' },
  { key: 'users', href: '/admin_users.html', label: 'ユーザー', icon: 'user', desc: '内部/外部・管理者・PW' },
  { key: 'shop', href: '/admin_shop.html', label: 'ショップ', icon: 'bag', desc: '称号・フレーム・ガチャ' },
  { key: 'distribute', href: '/admin_distribute.html', label: '配布', icon: 'gift', desc: '最終配布・付与・履歴' },
  { key: 'settings', href: '/admin_settings.html', label: '設定', icon: 'gear', desc: '自動承認・お便り・お知らせ' },
  { key: 'videos', href: '/admin_pending_videos.html', label: '動画', icon: 'play', desc: '動画の承認' },
  { key: 'chart', href: '/admin_chart_data.html', label: 'チャート', icon: 'list', desc: 'CSVの取り込み・アイコン' },
  { key: 'analytics', href: '/admin_analytics.html', label: '集計', icon: 'chart', desc: '利用者数・ポイントの推移' },
];
function renderAdminNav() {
  const el = document.querySelector('.admin-nav[data-current]');
  if (!el) return;
  const cur = el.dataset.current;
  el.innerHTML = ADMIN_PAGES.map(pg => pg.key === cur
    ? `<span class="on" aria-current="page" data-key="${pg.key}">${uiIcon(pg.icon, 15)}${pg.label}</span>`
    : `<a href="${pg.href}" data-key="${pg.key}">${uiIcon(pg.icon, 15)}${pg.label}</a>`).join('');
  const on = el.querySelector('.on');
  if (on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
  apiFetch('/feedback/admin-unread-count').then(d => {
    const put = (key, n) => { const a = el.querySelector(`[data-key="${key}"]`); if (a && n > 0) a.insertAdjacentHTML('beforeend', `<b class="admin-nav-n">${n}</b>`); };
    put('scores', d.scores || 0);
    put('settings', d.feedback || 0);
    put('videos', d.videos || 0);
  }).catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAdminNav);
else setTimeout(renderAdminNav);

// 本文中に並べる小さいアイコン（チップ・バナー用）
function uiIconInline(name) {
  return `<span style="display:inline-flex;vertical-align:-0.15em;margin-right:4px">${uiIcon(name, 13)}</span>`;
}

// ===== ナビ =====
function renderNav() {
  const user = getUser();
  const nav = document.getElementById('nav');
  if (!nav) return;
  const currentPath = location.pathname;
  const lang = getLang();
  const langBtn = `<button class="nav-lang" onclick="setLang(getLang()==='ja'?'zh':'ja')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:0.75rem;cursor:pointer;color:var(--text-muted);margin-right:4px" title="言語 / Language">${lang === 'ja' ? '繁中' : 'JP'}</button>`;

  nav.innerHTML = `
    <div class="nav-inner">
      <a class="nav-logo" href="/index.html" aria-label="ヘブバン ランクボード トップへ"><span class="nav-logo-mark">${NAV_LOGO_MARK}</span><span class="nav-logo-txt"><b>HBR</b><i>RANK BOARD</i></span></a>
      <div class="nav-links">
        <a href="/submit.html" class="${currentPath === '/submit.html' ? 'active' : ''}">${t('nav.submit')}</a>
        <span id="nav-gacha-desktop" style="display:contents"></span>
        ${user ? `<a href="/charts.html" class="${currentPath === '/charts.html' || currentPath.startsWith('/chart-') ? 'active' : ''}">${t('nav.charts')}</a>` : ''}
        ${user ? `<a href="/videos.html" class="${currentPath === '/videos.html' ? 'active' : ''}">${t('nav.my_videos')}</a>` : ''}
        ${user ? `<a href="/shop.html" class="${currentPath === '/shop.html' && !location.search.includes('tab=equip') ? 'active' : ''}">${t('nav.shop')}</a>` : ''}
        ${user ? `<a href="/shop.html?tab=equip" class="${currentPath === '/shop.html' && location.search.includes('tab=equip') ? 'active' : ''}">${t('nav.equip')}</a>` : ''}
        ${user ? `<a href="/feedback.html" class="${currentPath === '/feedback.html' ? 'active' : ''}">${t('nav.feedback')}</a>` : ''}
        ${user && user.role === 'admin' ? `<a href="/admin_index.html" class="${currentPath.startsWith('/admin') ? 'active' : ''}">${t('nav.admin')}</a>` : ''}
      </div>
      <div class="nav-user">
        ${langBtn}
        ${user
          ? `<a href="/user.html?id=${user.id}" class="nav-username">${escHtml(user.username)}</a>
             ${user.role === 'admin' ? adminBadgeHtml() : ''}
             <button class="btn btn-secondary btn-sm nav-desktop-only" onclick="logout()">${t('nav.logout')}</button>`
          : `<a href="/login.html" class="au-login">${t('nav.login')}</a>
             <a href="/register.html" class="au-reg">${AU_ICON_REG}<span class="au-full">${t('nav.register_full')}</span><span class="au-short">${t('nav.register')}</span></a>`
        }
      </div>
      <button class="nav-hamburger" id="nav-hamburger" onclick="toggleMobileNav()" aria-label="${t('nav.menu')}">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="nav-mobile" id="nav-mobile" aria-hidden="true">
      <div class="nm-panel">
        ${user
          ? `<a class="nm-user" href="/user.html?id=${user.id}">
               <span class="nm-avatar${user.icon_url ? ' has-img' : ''}" id="nm-avatar">${navAvatarInner(user)}</span>
               <span class="nm-user-body"><b>${escHtml(user.username)}</b><small>${t('nav.account')}</small></span>
               ${user.role === 'admin' ? adminBadgeHtml() : ''}
               <svg class="nm-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
             </a>`
          : `<div class="nm-guest">
               <a href="/login.html" class="au-login">${AU_ICON_LOGIN}${t('nav.login')}</a>
               <a href="/register.html" class="au-reg">${AU_ICON_REG}${t('nav.register_full')}</a>
             </div>`}
        <div class="nm-grid">
          ${nmTile('/submit.html', 'submit', t('nav.submit'), currentPath === '/submit.html')}
          <span id="nav-gacha-mobile" style="display:contents"></span>
          ${user ? nmTile('/charts.html', 'charts', t('nav.charts'), currentPath === '/charts.html' || currentPath.startsWith('/chart-')) : ''}
          ${user ? nmTile('/videos.html', 'videos', t('nav.my_videos'), currentPath === '/videos.html') : ''}
          ${user ? nmTile('/shop.html', 'shop', t('nav.shop'), currentPath === '/shop.html' && !location.search.includes('tab=equip')) : ''}
          ${user ? nmTile('/shop.html?tab=equip', 'equip', t('nav.equip'), currentPath === '/shop.html' && location.search.includes('tab=equip')) : ''}
          ${user ? nmTile('/feedback.html', 'feedback', t('nav.feedback'), currentPath === '/feedback.html') : ''}
          ${user && user.role === 'admin' ? nmTile('/admin_index.html', 'admin', t('nav.admin'), currentPath.startsWith('/admin')) : ''}
        </div>
        <div class="nm-foot">
          <div class="nm-lang" role="group" aria-label="言語 / Language">
            <button type="button" class="${lang === 'ja' ? 'on' : ''}" onclick="getLang() !== 'ja' && setLang('ja')" aria-pressed="${lang === 'ja'}">日本語</button><button type="button" class="${lang === 'zh' ? 'on' : ''}" onclick="getLang() !== 'zh' && setLang('zh')" aria-pressed="${lang === 'zh'}">繁中</button>
          </div>
          ${user ? `<button type="button" class="nm-logout" onclick="logout()">${ni('logout')}<span>${t('nav.logout')}</span></button>` : ''}
        </div>
      </div>
    </div>`;
  applyI18n();
}

// メニューの自分のアイコン：装備中のアイコン（なければ名前の頭文字）
function navAvatarInner(user) {
  return user.icon_url
    ? `<img src="${escHtml(thumbUrl(user.icon_url))}" alt="" class="${user.icon_rarity ? `icon-rarity-${escHtml(user.icon_rarity)}` : ''}">`
    : escHtml((user.username || '?').charAt(0));
}
function updateNavAvatar(user) {
  const el = document.getElementById('nm-avatar');
  if (el) { el.innerHTML = navAvatarInner(user); el.classList.toggle('has-img', !!user.icon_url); }
}

// メニューのタイル（アイコン＋名前）。nb はバッジ（未読数）を入れる場所
// ログイン・新規登録ボタンのアイコン（ドアに入る矢印、人型＋）
const AU_ICON_LOGIN = '<svg class="au-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>';
const AU_ICON_REG = '<svg class="au-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M19 8v6M16 11h6"/></svg>';

function nmTile(href, icon, label, active) {
  return `<a href="${href}" class="nm-tile${active ? ' active' : ''}"><span class="nm-ico">${NAV_ICONS[icon] || ''}<span class="nb"></span></span><span class="nm-label">${label}</span></a>`;
}

function toggleMobileNav(force) {
  const m = document.getElementById('nav-mobile');
  if (!m) return;
  const wasOpen = m.classList.contains('open');
  const open = typeof force === 'boolean' ? force : !wasOpen;
  if (open === wasOpen) return;
  m.classList.toggle('open', open);
  // 開いている間は後ろのページをスクロールさせない
  if (open) lockBodyScroll(); else unlockBodyScroll();
  m.setAttribute('aria-hidden', !open);
  document.getElementById('nav-hamburger')?.classList.toggle('open', open);
  document.getElementById('nav-hamburger')?.setAttribute('aria-expanded', open);
}
// メニューの外（暗い部分）を押したら閉じる
document.addEventListener('click', e => {
  const m = document.getElementById('nav-mobile');
  if (m && m.classList.contains('open') && e.target === m) toggleMobileNav(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleMobileNav(false); });
// スマホ（iOS）は overflow:hidden だけでは後ろが動くので、メニューの外の指の移動を止める
document.addEventListener('touchmove', e => {
  const m = document.getElementById('nav-mobile');
  if (m && m.classList.contains('open') && !e.target.closest('.nm-panel')) e.preventDefault();
}, { passive: false });

// renderNav後に自動でログインボーナスチェック＋ガチャナビ更新
const _origRenderNav = renderNav;
renderNav = function() {
  _origRenderNav();
  if (!document.getElementById('login-bonus-modal')) initLoginBonus();
  if (!document.getElementById('interim-dist-modal')) initInterimDistributionNotice();
  updateGachaNav().then(updateNavMarks);
  updateFeedbackBadge();
  updateAdminFeedbackBadge();
  checkGoogleLink();
  initAccountSettingsPrompt();
  if (!document.getElementById('announcement-modal')) initAnnouncementCheck();
  _trackPageView();
};

// ===== お知らせモーダル（1人1回だけ表示） =====
async function initAnnouncementCheck() {
  try {
    const token = getToken();
    const list = await fetch(API + '/announcements', { headers: token ? { Authorization: 'Bearer ' + token } : {} }).then(r => r.json());
    if (!Array.isArray(list) || list.length === 0) return;
    // お知らせのリンクで別のページへ移ったときは、残りの未読はTOPに戻るまで出さない
    const onTop = ['/', '/index.html'].includes(location.pathname);
    try { if (sessionStorage.getItem('hbr_ann_paused')) { if (!onTop) return; sessionStorage.removeItem('hbr_ann_paused'); } } catch {}
    const seenId = parseInt(localStorage.getItem('hbr_seen_announcement_id') || '0', 10);
    const now = new Date();
    // 未読のうち、通知対象（登録日時で絞ったお知らせは対象のユーザーだけ）で、モーダル表示期間内（未設定なら常時）のものを、古い順に全部表示
    window._annQueue = list.filter(a =>
      a.id > seenId && a.notify &&
      (!a.modal_start || new Date(a.modal_start) <= now) &&
      (!a.modal_end || new Date(a.modal_end) >= now)
    ).sort((a, b) => a.id - b.id);
    window._annIdx = 0;
    if (!window._annQueue.length) return;
    showAnnouncementModal(window._annQueue[0]);
  } catch {}
}

// ===== モーダル表示中の背景スクロールロック（多重開閉に対応するカウンタ方式） =====
let _scrollLockCount = 0;
function lockBodyScroll() {
  _scrollLockCount++;
  document.body.style.overflow = 'hidden';
}
function unlockBodyScroll() {
  _scrollLockCount = Math.max(0, _scrollLockCount - 1);
  if (_scrollLockCount === 0) document.body.style.overflow = '';
}

// ===== 確認・通知ダイアログ（ブラウザ標準の confirm / alert の代わり） =====
// OKで true、キャンセル・背景クリック・Escで false を返す
function _showDialog(message, { okLabel = t('dialog.ok'), cancelLabel = null, danger = false } = {}) {
  if (!document.getElementById('app-dialog-style')) {
    const style = document.createElement('style');
    style.id = 'app-dialog-style';
    style.textContent = `
      .app-dialog { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:4000; display:flex; align-items:center; justify-content:center; padding:16px; }
      .app-dialog-box {
        background:var(--bg-modal); backdrop-filter:blur(20px) saturate(150%); -webkit-backdrop-filter:blur(20px) saturate(150%);
        border:1px solid var(--border-light); border-radius:14px; padding:22px 20px 18px; max-width:360px; width:100%;
        animation: appDialogIn 0.18s ease-out both;
      }
      .app-dialog-msg { font-size:0.92rem; line-height:1.7; white-space:pre-line; word-break:break-word; margin-bottom:18px; }
      .app-dialog-actions { display:flex; gap:8px; }
      .app-dialog-actions .btn { flex:1; justify-content:center; }
      @keyframes appDialogIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
      @media (prefers-reduced-motion: reduce) { .app-dialog-box { animation:none; } }
    `;
    document.head.appendChild(style);
  }
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const el = document.createElement('div');
    el.className = 'app-dialog';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="app-dialog-box">
        <div class="app-dialog-msg"></div>
        <div class="app-dialog-actions">
          ${cancelLabel ? '<button type="button" class="btn btn-secondary" data-result="0"></button>' : ''}
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-result="1"></button>
        </div>
      </div>`;
    el.querySelector('.app-dialog-msg').textContent = message;
    el.querySelector('[data-result="1"]').textContent = okLabel;
    if (cancelLabel) el.querySelector('[data-result="0"]').textContent = cancelLabel;

    const onKey = e => { if (e.key === 'Escape') close(false); };
    function close(result) {
      el.remove();
      document.removeEventListener('keydown', onKey);
      unlockBodyScroll();
      prevFocus?.focus?.();
      resolve(result);
    }
    el.addEventListener('click', e => {
      if (e.target === el) return close(false);
      const btn = e.target.closest('[data-result]');
      if (btn) close(btn.dataset.result === '1');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    lockBodyScroll();
    el.querySelector('[data-result="1"]').focus();
  });
}
function showConfirm(message, opts = {}) {
  return _showDialog(message, { cancelLabel: t('dialog.cancel'), ...opts });
}
function showMessage(message) {
  return _showDialog(message);
}

function showAnnouncementModal(a) {
  if (document.getElementById('announcement-modal')) return;
  if (!document.getElementById('announcement-style')) {
    const style = document.createElement('style');
    style.id = 'announcement-style';
    style.textContent = `
      #announcement-modal { display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2500; align-items:center; justify-content:center; padding:16px; }
      #announcement-box {
        background:var(--bg-modal); backdrop-filter:blur(20px) saturate(150%); -webkit-backdrop-filter:blur(20px) saturate(150%);
        border:1px solid var(--border-light); border-radius:14px; padding:24px;
        max-width:420px; width:100%; text-align:left; max-height:85vh; overflow-y:auto;
      }
    `;
    document.head.appendChild(style);
  }
  const modal = document.createElement('div');
  modal.id = 'announcement-modal';
  modal.addEventListener('click', e => { if (e.target === modal) closeAnnouncementModal(a.id); });
  // 未読が複数あるときは「1 / 3」と「次へ」
  const q = window._annQueue || [], i = q.indexOf(a), more = i >= 0 && i < q.length - 1;
  modal.innerHTML = `
    <div id="announcement-box">
      <div style="font-size:0.72rem;color:var(--accent);font-weight:bold;letter-spacing:0.05em;margin-bottom:6px;display:flex;justify-content:space-between">${escHtml(t('ann.badge'))}${q.length > 1 && i >= 0 ? `<span style="color:var(--text-muted)">${i + 1} / ${q.length}</span>` : ''}</div>
      <div style="font-size:1.1rem;font-weight:bold;margin-bottom:10px">${escHtml(a.title)}</div>
      ${a.image_url ? `<img src="${escHtml(a.image_url)}" style="width:100%;border-radius:8px;margin-bottom:10px;display:block">` : ''}
      <div style="font-size:0.9rem;white-space:pre-wrap;word-break:break-all;color:var(--text-primary);margin-bottom:16px">${escHtml(a.body)}</div>
      ${a.link_url ? `<a href="${escHtml(a.link_url)}" ${isSiteLink(a.link_url) ? '' : 'target="_blank" rel="noopener noreferrer"'} onclick="followAnnouncementLink(${a.id})" class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:10px;text-decoration:none;box-sizing:border-box">${escHtml(a.link_label || t('ann.detail'))}</a>` : ''}
      <button class="btn btn-secondary" style="width:100%;justify-content:center;box-sizing:border-box" onclick="closeAnnouncementModal(${a.id})">${escHtml(t(more ? 'ann.next' : 'ann.close'))}</button>
    </div>`;
  document.body.appendChild(modal);
  lockBodyScroll();
}

// サイト内のリンクかどうか（サイト内なら同じタブで開く）
function isSiteLink(url) {
  try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
}

// お知らせのリンクを押したとき：そのお知らせは既読にして、残りはTOPに戻ったときに続きから出す
function followAnnouncementLink(id) {
  const seen = parseInt(localStorage.getItem('hbr_seen_announcement_id') || '0', 10);
  localStorage.setItem('hbr_seen_announcement_id', String(Math.max(seen, id)));
  const q = window._annQueue || [];
  if (q.some(a => a.id > id)) { try { sessionStorage.setItem('hbr_ann_paused', '1'); } catch {} }
  document.getElementById('announcement-modal')?.remove();
  unlockBodyScroll();
}

function closeAnnouncementModal(id) {
  const seen = parseInt(localStorage.getItem('hbr_seen_announcement_id') || '0', 10);
  localStorage.setItem('hbr_seen_announcement_id', String(Math.max(seen, id)));
  document.getElementById('announcement-modal')?.remove();
  unlockBodyScroll();
  // 未読が残っていれば次のお知らせへ
  const q = window._annQueue || [], i = q.findIndex(a => a.id === id);
  if (i >= 0 && q[i + 1]) showAnnouncementModal(q[i + 1]);
}

function _trackPageView() {
  const token = getToken();
  if (!token) return;
  const page = location.pathname === '/' ? '/index.html' : location.pathname;
  fetch('/api/analytics/pageview', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page })
  }).catch(() => {});
}

async function updateFeedbackBadge() {
  const user = getUser();
  if (!user) return;
  try {
    const data = await apiFetch('/feedback/unread-reply-count');
    if (!data.count) return;
    const badge = `<span style="display:inline-block;min-width:16px;height:16px;line-height:16px;font-size:0.65rem;font-weight:bold;background:#ef5350;color:#fff;border-radius:8px;text-align:center;padding:0 4px;margin-left:4px;vertical-align:middle">${data.count}</span>`;
    document.querySelectorAll('a[href="/feedback.html"]').forEach(a => {
      const nb = a.querySelector('.nb');
      if (nb) nb.innerHTML = `<i>${data.count}</i>`; else a.innerHTML = t('nav.feedback') + badge;
    });
  } catch {}
}

async function updateAdminFeedbackBadge() {
  const user = getUser();
  if (!user || user.role !== 'admin') return;
  try {
    const data = await apiFetch('/feedback/admin-unread-count');
    if (!data.count) return;
    const badge = `<span style="display:inline-block;min-width:16px;height:16px;line-height:16px;font-size:0.65rem;font-weight:bold;background:#ef5350;color:#fff;border-radius:8px;text-align:center;padding:0 4px;margin-left:4px;vertical-align:middle">${data.count}</span>`;
    document.querySelectorAll('a[href="/admin_index.html"]').forEach(a => {
      const nb = a.querySelector('.nb');
      if (nb) nb.innerHTML = `<i>${data.count}</i>`; else a.innerHTML = t('nav.admin') + badge;
    });
  } catch {}
}

async function updateGachaNav() {
  try {
    const cached = localStorage.getItem('gacha_show_nav');
    const cachedAt = parseInt(localStorage.getItem('gacha_nav_cached_at') || '0');
    let show = false;
    if (cached !== null && Date.now() - cachedAt < 5 * 60 * 1000) {
      show = cached === 'true';
    } else {
      const s = await apiFetch('/gacha/settings');
      show = s.show_nav;
      localStorage.setItem('gacha_show_nav', show ? 'true' : 'false');
      localStorage.setItem('gacha_nav_cached_at', Date.now());
    }
    const user = getUser();
    if (!user) return;
    if (!show && user.role !== 'admin') return;
    const currentPath = location.pathname;
    const isActive = currentPath === '/gacha.html';
    const d = document.getElementById('nav-gacha-desktop');
    const m = document.getElementById('nav-gacha-mobile');
    if (d) d.innerHTML = `<a href="/gacha.html"${isActive ? ' class="active"' : ''}>${t('nav.gacha')}</a>`;
    if (m) m.innerHTML = nmTile('/gacha.html', 'gacha', t('nav.gacha'), isActive);
  } catch {}
}

// 解放条件を満たしたガチャ・条件を満たして買えるフレームがあれば、ナビのガチャ・ショップに印を付ける。
// そのページを開いたら見た扱いにして消す（新しく増えたらまた付く）。問い合わせは5分ごと
async function updateNavMarks() {
  const user = getUser();
  if (!user) return;
  const key = `hbr_nav_marks:${user.id}`, seenKey = `hbr_nav_marks_seen:${user.id}`;
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let marks = read(key);
  if (!marks || Date.now() - (marks.at || 0) > 5 * 60 * 1000) {
    try {
      const [g, f] = await Promise.all([apiFetch('/gacha/unlocked').catch(() => null), apiFetch('/shop/frames/available').catch(() => null)]);
      marks = { at: Date.now(), gacha: g?.ids || [], frames: f?.ids || [] };
      write(key, marks);
    } catch { return; }
  }
  const seen = read(seenKey) || { gacha: [], frames: [] };
  const path = location.pathname;
  if (path === '/gacha.html') seen.gacha = [...new Set([...seen.gacha, ...marks.gacha])];
  if (path === '/shop.html' && !location.search.includes('tab=equip')) seen.frames = [...new Set([...seen.frames, ...marks.frames])];
  write(seenKey, seen);
  const fresh = (ids, s) => ids.some(id => !s.includes(id));
  const on = { '/gacha.html': fresh(marks.gacha, seen.gacha), '/shop.html': fresh(marks.frames, seen.frames) };
  let any = false; // ナビに出ていないリンク（ガチャを隠している時など）の分は、メニューのボタンにも付けない
  for (const [href, show] of Object.entries(on)) {
    document.querySelectorAll(`#nav a[href="${href}"]`).forEach(a => {
      a.querySelector('.nav-mark')?.remove();
      if (!show) return;
      any = true;
      const nb = a.querySelector('.nb');
      (nb || a).insertAdjacentHTML('beforeend', '<i class="nav-mark" aria-label="新着"></i>');
    });
  }
  document.getElementById('nav-hamburger')?.classList.toggle('has-mark', any);
}

function logout() {
  clearAuth();
  location.href = '/index.html';
}

function requireLogin() {
  if (!getToken()) {
    location.href = `/login.html?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return false;
  }
  return true;
}

function requireAdmin() {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    location.href = '/index.html';
    return false;
  }
  return true;
}

function isInternal() {
  const user = getUser();
  return !!(user && user.is_internal);
}

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function togglePw(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ===== 配布通知（中間・最終） =====
// 結果通知が全部終わったら（出すものがなければすぐ）解決する。TOPのレート更新の通知はこれを待ってから出す
let _resolveDistFlow;
window._distNoticeFlow = new Promise(r => { _resolveDistFlow = r; });
async function initInterimDistributionNotice() {
  if (!getToken()) { _resolveDistFlow(); return; }
  if (window._distNoticeStarted) return;
  window._distNoticeStarted = true;
  let opened = false;
  try {
    // 配布は外部最終配布のみ（内部・中間配布は廃止）
    const final = await apiFetch('/events/final-distributions/recent').catch(() => []);
    const seenAt = localStorage.getItem('interim_dist_seen_at');
    const isNew = d => !seenAt || new Date(d.distributed_at) > new Date(seenAt);
    const unseen = (final || []).filter(isNew).filter(d => d.user_rank != null)
      .map(d => ({ ...d, scope: 'external', period: t('dist.type_final'), is_final: true }))
      .sort((a, b) => new Date(a.distributed_at) - new Date(b.distributed_at));
    if (unseen.length === 0) return;

    const style = document.createElement('style');
    style.textContent = `
      #interim-dist-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2100; align-items:center; justify-content:center; }
      #interim-dist-modal.open { display:flex; }
      #interim-dist-box { background:var(--bg-modal); backdrop-filter:blur(20px) saturate(150%); -webkit-backdrop-filter:blur(20px) saturate(150%); border:1px solid var(--border-light); border-radius:14px; padding:28px 24px; max-width:360px; width:90%; text-align:center; max-height:90vh; overflow-y:auto; }
      #interim-dist-box h3 { margin:0 0 6px; font-size:1.1rem; }
      #interim-dist-box .interim-sub { font-size:0.82rem; color:var(--text-muted); margin-bottom:18px; }
      .dist-summary { position:relative; text-align:center; padding:14px 10px 16px; margin-bottom:8px; border-radius:10px; background:linear-gradient(180deg, rgba(212,175,106,0.08), rgba(212,175,106,0.02)); border:1px solid rgba(212,175,106,0.25); }
      .dist-summary-eyebrow { font-size:0.66rem; letter-spacing:0.08em; color:#d4af6a; font-weight:bold; margin-bottom:4px; }
      .dist-summary-event { font-size:0.92rem; font-weight:bold; color:var(--text-primary); line-height:1.4; }
      .dist-summary-pts { font-family:"Bebas Neue","Zen Kaku Gothic New",sans-serif; font-size:2.1rem; line-height:1; color:#d4af6a; margin-top:8px; letter-spacing:0.02em; }
      .dist-summary-pts span { font-size:1rem; font-family:inherit; opacity:0.75; margin-left:3px; }
      .dist-summary-pts .dist-pts-num { font-size:inherit; opacity:1; margin:0; font-variant-numeric:tabular-nums; display:inline-block; }
      .dist-summary-pts.done .dist-pts-num { animation:distPtsDone 0.6s ease-out; }
      @keyframes distPtsDone { 0% { transform:scale(1); text-shadow:none; } 40% { transform:scale(1.18); text-shadow:0 0 18px rgba(212,175,106,0.9); } 100% { transform:scale(1); text-shadow:none; } }
      .dist-pts-step { height:1.3em; margin-top:4px; font-size:0.74rem; font-weight:bold; color:#d4af6a; opacity:0; transition:opacity 0.15s; }
      .dist-pts-step.show { opacity:1; }
      .dist-summary { cursor:pointer; }
      @media (prefers-reduced-motion: reduce) { .dist-summary-pts.done .dist-pts-num { animation:none; } }
      .dist-summary-titles { display:flex; flex-wrap:wrap; gap:5px; justify-content:center; margin-top:10px; }
      .dist-summary-title-chip { font-size:0.7rem; padding:3px 10px; border-radius:99px; background:rgba(212,175,106,0.12); border:1px solid rgba(212,175,106,0.4); color:#d4af6a; }
      .rank-pts-table { width:100%; border-collapse:collapse; font-size:0.78rem; margin-top:8px; }
      .rank-pts-table th, .rank-pts-table td { padding:4px 8px; border:1px solid var(--border); text-align:center; }
      .rank-pts-table th { background:var(--bg-primary); color:var(--text-muted); }
      .rank-pts-table td:first-child { text-align:left; }
      .rank-pts-table td:last-child { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .rank-pts-table .sub td { font-size:0.7rem; color:var(--text-muted); border-top:none; }
      .rank-pts-table .total td { font-weight:bold; color:#d4af6a; }
      .rank-pts-note { font-size:0.72rem; color:var(--text-muted); margin-top:6px; }
    `;
    document.head.appendChild(style);

    window._distQueue = unseen;
    window._distQueueIdx = 0;

    const modal = document.createElement('div');
    modal.id = 'interim-dist-modal';
    document.body.appendChild(modal);
    renderDistNoticeModal(0);
    modal.classList.add('open');
    lockBodyScroll();
    opened = true;
  } catch {} finally {
    if (!opened) _resolveDistFlow();
  }
}

function renderDistNoticeModal(idx) {
  const modal = document.getElementById('interim-dist-modal');
  if (!modal) return;
  const unseen = window._distQueue;
  const d = unseen[idx];
  const total = unseen.length;
  const isLast = idx === total - 1;
  const scopeLabel = '';

  // 本人の配布量の内訳（新しい計算方式で配布した回のみ。以前の回は内訳なし）
  const b = d.breakdown;
  const attrLines = b ? (b.attrs || []).map(a => `
        <tr class="sub"><td>　${escHtml(a.attribute)}属性 ${a.rank}位/${a.n}人</td><td>+${a.rank_bonus} / +${a.score_bonus}</td></tr>`).join('') : '';
  const detailExtHtml = b ? `
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;width:100%" onclick="const x=document.getElementById('rank-pts-detail-ext');x.style.display=x.style.display==='none'?'block':'none'">配布量の内訳を見る</button>
    <div id="rank-pts-detail-ext" style="display:none;margin-top:8px">
      <table class="rank-pts-table">
        ${b.multiplier > 1 ? `<tr class="sub"><td>この回はポイント${b.multiplier}倍</td><td></td></tr>` : ''}
        <tr><td>参加ボーナス</td><td>+${b.parts.participation}pt</td></tr>
        <tr><td>総合順位ボーナス（${d.user_rank}位/${b.participants}人）</td><td>+${b.parts.overall_rank}pt</td></tr>
        <tr><td>総合スコアボーナス</td><td>+${b.parts.overall_score}pt</td></tr>
        <tr><td>属性順位ボーナス</td><td>+${b.parts.attr_rank}pt</td></tr>
        <tr><td>属性スコアボーナス</td><td>+${b.parts.attr_score}pt</td></tr>
        ${attrLines ? `<tr class="sub"><td>　属性ごとの内訳（順位 / スコア）</td><td></td></tr>${attrLines}` : ''}
        ${b.parts.coop ? `<tr><td>共闘目標ボーナス${b.coop ? `（${b.coop.pct}%達成）` : ''}</td><td>+${b.parts.coop}pt</td></tr>` : ''}
        <tr class="total"><td>合計</td><td>+${d.user_pts}pt</td></tr>
      </table>
      <div class="rank-pts-note">順位ボーナスは順位が高いほど、スコアボーナスは1位のスコアに近いほど多くなります。属性ボーナスは投稿した属性ごとにもらえます。</div>
    </div>` : '';

  modal.innerHTML = `
    <div id="interim-dist-box">
      <h3>${t('dist.title_final')}</h3>
      ${total > 1 ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">${idx + 1} / ${total}</div>` : ''}
      <div class="interim-sub">${t('dist.sub_final')}</div>
      <div class="dist-summary">
        <div class="dist-summary-eyebrow">${scopeLabel}${d.period}結果</div>
        <div class="dist-summary-event">${escHtml(d.event_name)}</div>
        <div class="dist-summary-pts" id="dist-summary-pts"><span class="dist-pts-num" id="dist-pts-num">+0</span><span>pt</span></div>
        <div class="dist-pts-step" id="dist-pts-step"></div>
        ${d.awarded_titles?.length ? `<div class="dist-summary-titles">${d.awarded_titles.map(n => `<span class="dist-summary-title-chip">${uiIconInline('trophy')}${escHtml(n)}</span>`).join('')}</div>` : ''}
      </div>
      <div id="dist-result-image"></div>
      ${detailExtHtml}
      ${isLast
        ? `<button class="btn btn-primary" style="margin-top:12px;width:100%" onclick="closeInterimDistModal()">${t('close')}</button>`
        : `<button class="btn btn-primary" style="margin-top:12px;width:100%" onclick="advanceDistNotice()">次へ →</button>`
      }
    </div>`;

  // ポイントの演出は結果画像ができてから始める（「次へ」で別の通知に切り替わっていたら始めない）
  renderDistResultImage(d, true).finally(() => {
    if (window._distQueueIdx === idx) animateDistPts(d);
  });
}

// 配布ポイントを内訳の順に足し上げる演出（内訳が無い回は合計まで一気に）。枠のタップで最後まで飛ばす
let _distPtsAnimId = 0;
function animateDistPts(d) {
  const animId = ++_distPtsAnimId; // 「次へ」で別の通知に切り替わったら古い演出は止める
  const num = document.getElementById('dist-pts-num');
  const step = document.getElementById('dist-pts-step');
  const wrap = document.getElementById('dist-summary-pts');
  const total = Number(d.user_pts) || 0;
  const p = d.breakdown && d.breakdown.parts;
  const steps = p
    ? [['参加ボーナス', p.participation], ['総合順位ボーナス', p.overall_rank], ['総合スコアボーナス', p.overall_score], ['属性順位ボーナス', p.attr_rank], ['属性スコアボーナス', p.attr_score], ['共闘目標ボーナス', p.coop || 0]].filter(([, v]) => v > 0)
    : [[null, total]];
  let skipped = false;
  const finish = () => {
    if (animId !== _distPtsAnimId) return;
    num.textContent = `+${total.toLocaleString('ja-JP')}`;
    step.classList.remove('show');
    wrap.classList.add('done');
  };
  document.querySelector('.dist-summary')?.addEventListener('click', () => { skipped = true; finish(); }, { once: true });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
  (async () => {
    let cur = 0;
    for (const [label, v] of steps) {
      if (skipped || animId !== _distPtsAnimId) return;
      step.textContent = label ? `${label} +${v.toLocaleString('ja-JP')}` : '';
      step.classList.toggle('show', !!label);
      const from = cur, to = cur + v, dur = 450, start = performance.now();
      await new Promise(resolve => {
        const tick = now => {
          if (skipped || animId !== _distPtsAnimId) return resolve();
          const t = Math.min(1, (now - start) / dur);
          const ease = 1 - Math.pow(1 - t, 3);
          num.textContent = `+${Math.round(from + (to - from) * ease).toLocaleString('ja-JP')}`;
          if (t < 1) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      cur = to;
      await new Promise(r => setTimeout(r, 180));
    }
    if (!skipped) finish();
  })();
}

function advanceDistNotice() {
  window._distQueueIdx = (window._distQueueIdx || 0) + 1;
  renderDistNoticeModal(window._distQueueIdx);
}

function closeInterimDistModal() {
  localStorage.setItem('interim_dist_seen_at', new Date().toISOString());
  document.getElementById('interim-dist-modal')?.classList.remove('open');
  unlockBodyScroll();
  _resolveDistFlow();
  const lbModal = document.getElementById('login-bonus-modal');
  if (lbModal && lbModal.classList.contains('open')) {
    lbModal.style.zIndex = '2100';
  }
}

// ===== 配布通知：結果画像（自動生成・インライン表示） =====
const ALL_RESULT_ATTRS = ['火', '氷', '雷', '光', '闇', '無'];
const RESULT_ATTR_COLORS = { '火':'#ff6a45','氷':'#54c2ff','雷':'#ffd84a','光':'#fff29a','闇':'#c085ff','無':'#a8a3c2' };

let _resultFontsReady = null;
function _ensureResultFonts() {
  if (_resultFontsReady) return _resultFontsReady;
  _resultFontsReady = new Promise(resolve => {
    if (document.getElementById('result-medal-fonts')) { resolve(); return; }
    const link = document.createElement('link');
    link.id = 'result-medal-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Bebas+Neue&display=swap';
    link.onload = resolve;
    link.onerror = resolve; // 取得失敗でもフォールバックフォントで続行
    document.head.appendChild(link);
  }).then(() => Promise.all([
    document.fonts.load('800 32px "Shippori Mincho B1"'),
    document.fonts.load('700 18px "Shippori Mincho B1"'),
    document.fonts.load('400 46px "Bebas Neue"'),
    document.fonts.load('700 16px "Zen Kaku Gothic New"'),
    document.fonts.load('900 20px "Zen Kaku Gothic New"'),
    document.fonts.load('500 12px "Zen Kaku Gothic New"'),
  ]).catch(() => {}));
  return _resultFontsReady;
}

// 結果画像を生成して表示（配布通知・ランキング画面の共有で共用）。boxId の要素に描画する
async function renderDistResultImage(d, includeUnsubmitted = true, boxId = 'dist-result-image') {
  const box = document.getElementById(boxId);
  if (!box || !d) return;
  box.innerHTML = `<div class="loading" style="padding:16px 0"><div class="spinner"></div></div>`;

  try {
    const me = getUser();
    const username = me?.username || '';
    const results = await apiFetch(`/events/${d.event_id}/my-results?scope=${d.scope}`);

    if (!results || results.length === 0) {
      box.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;margin-top:8px">承認済みリザルトがありません</p>`;
      return;
    }

    let dataUrl;
    try {
      dataUrl = await _generateResultCanvas(results, d.event_name, username, d.user_rank, d.is_final ? '最終結果' : '中間結果', includeUnsubmitted);
    } catch (e) {
      box.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;margin-top:8px">画像の生成に失敗しました（${escHtml(e.message)}）</p>`;
      return;
    }

    const xSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.75l7.73-8.835L1.254 2.25H8.08l4.259 5.632L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
    box.innerHTML = `
      <img src="${dataUrl}" style="max-width:100%;border-radius:10px;display:block;margin-top:10px" alt="result">
      <label style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:10px;font-size:0.78rem;color:var(--text-muted);cursor:pointer">
        <input type="checkbox" class="result-include-unsub" ${includeUnsubmitted ? 'checked' : ''}>
        未提出の属性も表示する
      </label>
      <button type="button" class="btn btn-secondary btn-sm result-share-btn" style="margin-top:8px;width:100%;display:flex;align-items:center;justify-content:center;gap:6px">${xSvg}共有</button>
    `;
    box.querySelector('.result-include-unsub').addEventListener('change', e => {
      renderDistResultImage(d, e.target.checked, boxId);
    });
    const shareBtn = box.querySelector('.result-share-btn');
    shareBtn.addEventListener('click', () => shareResultImage(dataUrl, d, shareBtn));
  } catch (err) {
    box.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;margin-top:8px">${escHtml(err.message)}</p>`;
  }
}

// 結果画像の共有。
//  ・スマホなど共有メニューが使える端末 … 画像ファイルを添付して共有メニューを開く（X を選ぶと画像付きで投稿できる）
//  ・それ以外（PC） … 画像を OGP 付きの共有ページ（/s/:id）にアップロードし、X の投稿画面を開く
async function shareResultImage(dataUrl, d, btn) {
  const tweetText = '（自由記述）\n\n非公式ファンサイト\n「ヘブバンランクボード」\nhebuban-rankboard.com\n#ヘブバン #ヘブバンランクボード';
  const original = btn ? btn.innerHTML : '';

  let file = null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const f = new File([blob], `${d.event_name}_result.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) file = f;
  } catch {}

  if (file) {
    try {
      await navigator.share({ files: [file], text: tweetText });
    } catch (e) {
      if (e.name !== 'AbortError') showMessage('共有に失敗しました: ' + e.message);
    }
    return;
  }

  // PC 用：ポップアップブロックを避けるためタブはクリック直後に開き、アップロード後に移動させる
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  if (btn) { btn.disabled = true; btn.textContent = 'アップロード中...'; }
  try {
    let sharePageUrl = null;
    try {
      const shareRes = await apiFetch('/share-image', { method: 'POST', body: JSON.stringify({ dataUrl, eventName: d.event_name }) });
      sharePageUrl = location.origin + shareRes.url;
    } catch { /* アップロードに失敗したらリンクなしで投稿 */ }
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(tweetText)}${sharePageUrl ? `&url=${encodeURIComponent(sharePageUrl)}` : ''}`;
    if (win) win.location.href = intent;
    else location.href = intent;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

// 終了したイベントの結果画像を作って共有する（ランキング画面の「結果を共有」）
async function openResultShareModal(ev) {
  document.getElementById('result-share-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'result-share-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:2100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.7)';
  modal.innerHTML = `
    <div style="width:100%;max-width:360px;max-height:90vh;overflow-y:auto;padding:22px 20px 18px;border-radius:14px;text-align:center;background:var(--bg-modal);border:1px solid var(--border-light)">
      <div style="font-size:1.05rem;font-weight:bold;margin-bottom:2px">結果を共有</div>
      <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:6px">${escHtml(ev.name)}</div>
      <div id="result-share-image"><div class="loading" style="padding:16px 0"><div class="spinner"></div></div></div>
      <button type="button" class="btn btn-secondary" style="margin-top:12px;width:100%;justify-content:center" id="result-share-close">${t('close')}</button>
    </div>`;
  const close = () => { modal.remove(); unlockBodyScroll(); };
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.body.appendChild(modal);
  lockBodyScroll();
  document.getElementById('result-share-close').addEventListener('click', close);
  try {
    // 公開ランキング（全属性）での自分の総合順位
    const me = getUser();
    const ranking = await apiFetch(`/events/${ev.id}/ranking`);
    const mine = ranking.find(r => String(r.user_id) === String(me.id));
    if (!mine) {
      document.getElementById('result-share-image').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;margin:12px 0">このイベントの承認済みスコアがありません</p>';
      return;
    }
    renderDistResultImage({ event_id: ev.id, event_name: ev.name, scope: 'external', user_rank: Number(mine.rank), is_final: true }, true, 'result-share-image');
  } catch (err) {
    document.getElementById('result-share-image').innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">${escHtml(err.message)}</p>`;
  }
}

// tierColor: 順位に応じた階級カラー（総合・属性ミニメダル共通。金/銀/銅/上位/それ以外）
function _resultTierColor(rank, top) {
  if (rank === 1) return '#e8c874';
  if (rank === 2) return '#cfd0da';
  if (rank === 3) return '#d99a63';
  if (rank <= top) return '#ff7a8c';
  return '#f2eee6';
}

function _hankoAngle(seed) {
  const x = Math.sin(seed * 999.7) * 10000;
  const frac = x - Math.floor(x);
  return (frac - 0.5) * 22; // -11〜11度
}

function _hankoOffset(seed) {
  const hx = Math.sin(seed * 12.9898) * 10000;
  const hy = Math.sin(seed * 78.2330) * 10000;
  const fx = hx - Math.floor(hx);
  const fy = hy - Math.floor(hy);
  return { dx: (fx - 0.5) * 16, dy: (fy - 0.5) * 16 }; // ±8px
}

function _seededRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 属性順位のミニメダル（総合順位バッジと同じ意匠のミニ版）
function _drawMiniMedal(ctx, cx, cy, r, rank, top, numeral, gothic, angleDeg = 0) {
  const tc = _resultTierColor(rank, top);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angleDeg * Math.PI / 180);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  const grad = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  grad.addColorStop(0, 'rgba(36,26,48,0.48)');
  grad.addColorStop(1, 'rgba(15,12,25,0.48)');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = tc;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();

  ctx.fillStyle = tc;
  ctx.textAlign = 'center';
  ctx.font = `400 ${Math.round(r * 0.78)}px ${numeral}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(rank), 0, r * 0.08);

  ctx.fillStyle = '#f2eee6';
  ctx.font = `700 ${Math.max(8, Math.round(r * 0.34))}px ${gothic}`;
  ctx.fillText('位', 0, r * 0.62);

  ctx.restore();
}

// 未提出の属性カードに押す丸ハンコ「未」。カードいっぱい、はみ出す勢いのサイズで、
// 呼び出し側でカードの角丸矩形にクリップしてから描くこと。
function _drawUnsubmittedStamp(ctx, cardX, cardY, w, h, seed, gothic) {
  const cx = cardX + w / 2, cy = cardY + h / 2;
  const r = Math.min(w, h) * 0.62;
  const ink = 'rgba(210,60,80,0.62)';
  const angle = _hankoAngle(seed * 3.1);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle * Math.PI / 180);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.055;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.025;
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(r * 1.08)}px ${gothic}`;
  ctx.fillText('未', 0, r * 0.04);

  // かすれ表現の斑点
  const rand = _seededRand(seed * 41 + 3);
  ctx.fillStyle = ink;
  for (let i = 0; i < 16; i++) {
    const ang = rand() * Math.PI * 2, rad = rand() * r;
    ctx.globalAlpha = rand() * 0.25 + 0.05;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, rand() * 1.7 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

async function _generateResultCanvas(results, eventName, username, overallRank, label = '', includeUnsubmitted = true) {
  await _ensureResultFonts();

  const resultByAttr = {};
  results.forEach(r => { resultByAttr[r.attribute] = r; });
  const attrs = includeUnsubmitted ? ALL_RESULT_ATTRS : ALL_RESULT_ATTRS.filter(a => resultByAttr[a]);

  const PAD = 18, COLS = 2, IMG_W = 300, IMG_H = 200;
  const HEADER_H = 190, FOOTER_H = 56;
  const genSeed = Date.now() % 100000; // 生成のたびにハンコの表情を変える種
  const n = attrs.length;
  const ROWS = Math.max(1, Math.ceil(n / COLS));

  const canvas = document.createElement('canvas');
  canvas.width  = PAD + COLS * (IMG_W + PAD);
  canvas.height = HEADER_H + PAD + ROWS * (IMG_H + PAD) + FOOTER_H;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const serif = '"Shippori Mincho B1", serif';
  const gothic = '"Zen Kaku Gothic New", sans-serif';
  const numeral = '"Bebas Neue", sans-serif';

  // ---- 背景（濃紺〜紫のグラデーション＋星） ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#171129');
  bg.addColorStop(0.5, '#0d0a1a');
  bg.addColorStop(1, '#0a0812');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const starRand = _seededRand(7);
  for (let i = 0; i < 70; i++) {
    const x = starRand() * W, y = starRand() * H;
    const r = starRand() * 1.1 + 0.3;
    ctx.globalAlpha = starRand() * 0.35 + 0.08;
    ctx.fillStyle = i % 6 === 0 ? '#d4af6a' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---- ヘッダー ----
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#9a92b8';
  ctx.font = `500 11px ${gothic}`;
  ctx.textAlign = 'left';
  const brand = 'HEAVEN BURNS RED RANKBOARD';
  let bx = PAD;
  for (const ch of brand) { ctx.fillText(ch, bx, 30); bx += ctx.measureText(ch).width + 1.6; }

  ctx.strokeStyle = 'rgba(212,175,106,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 42);
  ctx.lineTo(W - PAD, 42);
  ctx.stroke();

  const medalCX = W - PAD - 78, medalCY = 118, medalR = 62;
  const textRightLimit = medalCX - medalR - 20;

  ctx.fillStyle = '#f2eee6';
  ctx.font = `800 27px ${serif}`;
  ctx.textAlign = 'left';
  ctx.fillText(_canvasTrunc(ctx, eventName, textRightLimit - PAD), PAD, 84);

  // 中間/最終 ラベルピル
  ctx.font = `700 12px ${gothic}`;
  const labelW = ctx.measureText(label).width + 20;
  _roundRect(ctx, PAD, 96, labelW, 24, 12);
  ctx.strokeStyle = 'rgba(212,175,106,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#d4af6a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, PAD + labelW / 2, 96 + 12);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#8b87a0';
  ctx.font = `500 16px ${gothic}`;
  ctx.textAlign = 'left';
  ctx.fillText('✦ ' + _canvasTrunc(ctx, username, textRightLimit - PAD), PAD, 148);

  // メダル
  const medalGrad = ctx.createRadialGradient(medalCX, medalCY - 10, 4, medalCX, medalCY, medalR);
  medalGrad.addColorStop(0, '#5c2230');
  medalGrad.addColorStop(1, '#1c1638');
  ctx.beginPath();
  ctx.arc(medalCX, medalCY, medalR, 0, Math.PI * 2);
  ctx.fillStyle = medalGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#d4af6a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(medalCX, medalCY, medalR - 7, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(212,175,106,0.45)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#d4af6a';
  ctx.font = `500 10px ${gothic}`;
  ctx.fillText('総合順位', medalCX, medalCY - 30);

  ctx.fillStyle = _resultTierColor(Number(overallRank), 10);
  ctx.font = `400 46px ${numeral}`;
  ctx.fillText(String(overallRank), medalCX, medalCY + 16);

  ctx.fillStyle = '#f2eee6';
  ctx.font = `700 13px ${gothic}`;
  ctx.fillText('位', medalCX, medalCY + 38);

  // ---- 属性カード ----
  for (let i = 0; i < n; i++) {
    const attrKey = attrs[i];
    const rObj = resultByAttr[attrKey];
    const submitted = !!rObj;
    const col = i % COLS, row = Math.floor(i / COLS);
    const isLoneLastRow = (n % COLS !== 0) && (i === n - 1);
    const x = isLoneLastRow ? (W - IMG_W) / 2 : PAD + col * (IMG_W + PAD);
    const y = HEADER_H + PAD + row * (IMG_H + PAD);
    const color = RESULT_ATTR_COLORS[attrKey] || '#ffffff';

    ctx.save();
    _roundRect(ctx, x, y, IMG_W, IMG_H, 12);
    ctx.clip();

    // 土台のグラデーション（未提出はスクショが無いのでこれがそのまま背景になる）
    const cardGrad = ctx.createLinearGradient(x, y, x, y + IMG_H);
    cardGrad.addColorStop(0, '#211c33');
    cardGrad.addColorStop(1, '#15101f');
    ctx.fillStyle = cardGrad;
    ctx.fillRect(x, y, IMG_W, IMG_H);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + IMG_W * 0.72, y + IMG_H * 0.5, IMG_H * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (submitted && rObj.approved_image_url) {
      try {
        const img = await _loadImage(rObj.approved_image_url);
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const boxAspect = IMG_W / IMG_H;
        let sx, sy, sw, sh;
        if (imgAspect > boxAspect) {
          sh = img.naturalHeight; sw = sh * boxAspect;
          sx = (img.naturalWidth - sw) / 2; sy = 0;
        } else {
          sw = img.naturalWidth; sh = sw / boxAspect;
          sx = 0; sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, IMG_W, IMG_H);
      } catch { /* 画像なしのまま土台グラデーションを表示 */ }
    }

    // 上端の属性カラーストライプ
    ctx.fillStyle = color;
    ctx.fillRect(x, y, IMG_W, 3);
    ctx.restore();

    if (!submitted) {
      // カードの角丸にクリップしてから押す＝はみ出す勢いのサイズでもカード外は描かれない
      ctx.save();
      _roundRect(ctx, x, y, IMG_W, IMG_H, 12);
      ctx.clip();
      _drawUnsubmittedStamp(ctx, x, y, IMG_W, IMG_H, (i + 1) * 137 + genSeed, gothic);
      // ハンコが上端の属性カラーストライプに被るので、ストライプを上から描き直す
      ctx.fillStyle = color;
      ctx.fillRect(x, y, IMG_W, 3);
      ctx.restore();
    }

    // 属性紋章バッジ（左上の角に重ねる）
    const bR = 22, bCX = x + 12, bCY = y;
    ctx.beginPath();
    ctx.arc(bCX, bCY, bR, 0, Math.PI * 2);
    ctx.fillStyle = '#0f0c19';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `900 17px ${gothic}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(attrKey, bCX, bCY + 1);
    ctx.textBaseline = 'alphabetic';

    // 属性順位ミニメダル（提出済みのみ・右上少し下げた位置）
    if (submitted) {
      const off = _hankoOffset(i + 1);
      _drawMiniMedal(ctx, x + IMG_W - 66 + off.dx, y + 60 + off.dy, 37, Number(rObj.attr_rank), 5, numeral, gothic, _hankoAngle(i + 1));
    }
  }

  // ---- フッター ----
  const footY = HEADER_H + PAD + ROWS * (IMG_H + PAD);
  ctx.strokeStyle = 'rgba(212,175,106,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, footY + 18);
  ctx.lineTo(W - PAD, footY + 18);
  ctx.stroke();

  ctx.fillStyle = '#948da8';
  ctx.font = `500 11px ${gothic}`;
  ctx.textAlign = 'center';
  ctx.fillText('✦  hebuban-rankboard.com  ✦', W / 2, footY + 40);

  // 外周
  ctx.strokeStyle = 'rgba(212,175,106,0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error('CORS制限により画像を書き出せませんでした');
  }
}

function _loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
    img.src = url;
  });
}

function _canvasTrunc(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// ===== アカウント設定促進モーダル =====
async function initAccountSettingsPrompt() {
  if (!getToken()) return;
  const seenAt = localStorage.getItem('account_prompt_seen');
  if (seenAt && Date.now() - new Date(seenAt).getTime() < 7 * 24 * 60 * 60 * 1000) return;

  // 結果通知とレート更新の通知（TOPのみ）が終わってから
  await Promise.all([window._distNoticeFlow, window._rankUpdatePromise].filter(Boolean));
  await new Promise(r => setTimeout(r, 600));

  const rateModal = document.getElementById('rate-modal');
  const distModal = document.getElementById('interim-dist-modal');
  if (rateModal || (distModal && distModal.classList.contains('open'))) return;

  try {
    const user = getUser();
    if (!user) return;
    const data = await apiFetch(`/users/${user.id}`).catch(() => null);
    if (!data) return;
    if (data.twitter_username || data.youtube_channel) return;

    const needX = !data.twitter_username;
    const needYt = !data.youtube_channel;

    const modal = document.createElement('div');
    modal.id = 'account-settings-prompt';
    modal.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2050;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
      <div style="background:var(--bg-modal);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);border:1px solid var(--border-light);border-radius:14px;padding:28px 24px;max-width:340px;width:90%;text-align:center">
        <div style="font-size:1.05rem;font-weight:bold;margin-bottom:8px">${t('acct.title')}</div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:18px;line-height:1.6">
          ${t('acct.desc')}<br>
          <span style="font-size:0.78rem">${t('acct.profile_hint')}</span>
        </div>
        ${needX ? `<div style="text-align:left;margin-bottom:12px">
          <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px">X (Twitter) ID</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--text-muted);font-size:0.9rem">@</span>
            <input id="prompt-twitter" class="form-input" type="text" maxlength="15" placeholder="username" autocomplete="off" style="flex:1">
          </div>
        </div>` : ''}
        ${needYt ? `<div style="text-align:left;margin-bottom:16px">
          <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px">${t('acct.yt_label')}</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--text-muted);font-size:0.9rem">@</span>
            <input id="prompt-youtube" class="form-input" type="text" maxlength="30" placeholder="handle" autocomplete="off" style="flex:1">
          </div>
        </div>` : ''}
        <div id="prompt-error" style="font-size:0.8rem;color:#e05;margin-bottom:8px;display:none"></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary" onclick="submitAccountPrompt()">${t('acct.register')}</button>
          <button class="btn btn-secondary" onclick="closeAccountPrompt()">${t('acct.later')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    lockBodyScroll();

    window.closeAccountPrompt = function() {
      localStorage.setItem('account_prompt_seen', new Date().toISOString());
      document.getElementById('account-settings-prompt')?.remove();
      unlockBodyScroll();
    };

    window.submitAccountPrompt = async function() {
      const twitterRaw = (document.getElementById('prompt-twitter')?.value || '').trim().replace(/^@/, '');
      const ytRaw = (document.getElementById('prompt-youtube')?.value || '').trim().replace(/^@/, '');
      const errEl = document.getElementById('prompt-error');
      errEl.style.display = 'none';
      if (needX && twitterRaw && !/^[A-Za-z0-9_]{1,15}$/.test(twitterRaw)) {
        errEl.textContent = t('user.x_err');
        errEl.style.display = '';
        return;
      }
      if (needYt && ytRaw && !/^[A-Za-z0-9._-]{3,30}$/.test(ytRaw)) {
        errEl.textContent = t('acct.yt_err');
        errEl.style.display = '';
        return;
      }
      try {
        await apiFetch('/auth/me', {
          method: 'PUT',
          body: JSON.stringify({
            twitter_username: needX ? (twitterRaw || null) : undefined,
            youtube_channel:  needYt ? (ytRaw || null) : undefined,
          })
        });
        closeAccountPrompt();
      } catch (e) {
        errEl.textContent = e.message || t('acct.save_err');
        errEl.style.display = '';
      }
    };
  } catch {}
}

// ===== ログインボーナス「デイリーバトル」 =====
const LB_WEAPONS = ['斬', '突', '打'];
const LB_ELEMENTS = ['火', '氷', '雷', '光', '闇', '無'];
const LB_TIERS = {
  '-2': { label: 'MISS', tone: 'tone-danger', flavor: '相性最悪、攻撃がまったく通じていない……' },
  '-1': { label: 'BAD', tone: 'tone-warning', flavor: '耐性に阻まれ、十分にダメージを与えられない。' },
  '0':  { label: 'GOOD', tone: 'tone-neutral', flavor: '決定打には欠けるが、確かに一撃を与えた。' },
  '1':  { label: 'GREAT', tone: 'tone-success', flavor: '弱点を1つ突き、着実にダメージを与えた。' },
  '2':  { label: 'PERFECT', tone: 'tone-jackpot', flavor: '弱点を完全にとらえ、大ダメージを与えた。' },
};
const LB_REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let _lbWeaponPick = null, _lbElementPick = null;
let _lbPreview = null; // 管理画面の確認用のとき、その設定

async function initLoginBonus() {
  if (!getToken()) return;

  const style = document.createElement('style');
  style.textContent = `
    #login-bonus-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:2000; align-items:flex-start; justify-content:center; padding:clamp(12px, 7dvh, 64px) 12px 12px; } /* 上寄せ：結果で枠が伸びても敵の画像の位置を動かさない */
    #login-bonus-modal.open { display:flex; }
    #login-bonus-box { position:relative; width:100%; max-width:400px; max-height:calc(100dvh - clamp(12px, 7dvh, 64px) - 12px); overflow-y:auto; overscroll-behavior:contain; background:var(--bg-modal); backdrop-filter:blur(20px) saturate(150%); -webkit-backdrop-filter:blur(20px) saturate(150%); border:1px solid rgba(212,175,106,0.42); border-radius:16px; box-shadow:0 18px 50px rgba(0,0,0,0.6); animation:lbBoxIn .32s cubic-bezier(.2,.9,.3,1.15) both; }
    @keyframes lbBoxIn { from{opacity:0; transform:translateY(14px) scale(.97);} to{opacity:1; transform:none;} }
    .lb-head { display:flex; align-items:baseline; justify-content:center; gap:10px; padding:14px 16px 10px; }
    .lb-eyebrow { font-family:"Orbitron",sans-serif; font-size:0.62rem; font-weight:800; letter-spacing:0.2em; color:#d4af6a; }
    .lb-head h3 { margin:0; font-size:1.02rem; }
    .lb-preview-tag, .lb-preview-cancel { display:none; }
    #login-bonus-modal[data-preview] .lb-preview-tag { display:inline-block; padding:1px 8px; border-radius:99px; font-size:0.68rem; font-weight:bold; color:#ffb3bf; border:1px solid rgba(255,107,128,0.6); }
    #login-bonus-modal[data-preview] .lb-preview-cancel { display:block; width:100%; margin-top:10px; }

    .lb-day-track { position:relative; margin:0 16px 12px; }
    .lb-day-track-line { position:absolute; left:15px; right:15px; top:14px; height:2px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; }
    .lb-day-track-fill { height:100%; width:0%; background:linear-gradient(90deg,#d4af6a,#f0d08a); transition:width .5s ease; }
    .lb-day-medals { position:relative; z-index:1; display:flex; justify-content:space-between; }
    .lb-day-medal { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; position:relative; font-size:0.78rem; font-weight:bold; font-variant-numeric:tabular-nums; color:var(--text-muted); background:#17142a; border:1px solid rgba(255,255,255,0.16); }
    .lb-day-medal.done { border-color:rgba(212,175,106,0.55); color:#d4af6a; background:#2a2234; }
    .lb-day-medal.today { border-color:#d4af6a; color:#fff; background:#5a4726; box-shadow:0 0 0 1px #d4af6a, 0 0 12px rgba(212,175,106,0.55); }
    .lb-day-medal.day7 { border-color:rgba(255,122,140,0.55); color:#ff7a8c; }
    .lb-day-medal.day7.today { border-color:#ff7a8c; color:#fff; background:#7a3044; box-shadow:0 0 0 1px #ff7a8c, 0 0 14px rgba(255,122,140,0.6); }
    .lb-day-medal.day7 svg { position:absolute; top:-5px; right:-4px; width:11px; height:11px; }
    .lb-day-medal.just { animation:lbMedalJust .5s cubic-bezier(.2,.9,.3,1.5) both; }
    @keyframes lbMedalJust { 0%{transform:scale(.6);} 60%{transform:scale(1.25);} 100%{transform:scale(1);} }

    /* 敵の舞台：画像の上に攻撃の演出を重ねる */
    .lb-arena { position:relative; height:clamp(150px, 27dvh, 220px); overflow:hidden; background:#0b0916; isolation:isolate; border-block:1px solid rgba(212,175,106,0.28); }
    .lb-arena-art { position:absolute; inset:0; animation:lbIdle 3.6s ease-in-out infinite; }
    .lb-arena-art img { width:100%; height:100%; object-fit:cover; display:block; }
    .lb-arena-art svg { width:100%; height:100%; }
    @keyframes lbIdle { 0%,100%{transform:scale(1.03) translateY(0);} 50%{transform:scale(1.05) translateY(-3px);} }
    .lb-arena-name { position:absolute; left:0; right:0; bottom:0; z-index:2; padding:22px 14px 8px; font-size:0.98rem; font-weight:bold; color:#fff; text-align:center; text-shadow:0 1px 4px rgba(0,0,0,0.9); background:linear-gradient(transparent, rgba(8,6,18,0.85)); }
    @keyframes lbHit { 0%{filter:brightness(2.6); transform:scale(1.03) translateX(-7px);} 30%{transform:scale(1.03) translateX(6px);} 60%{transform:scale(1.03) translateX(-3px);} 100%{filter:none; transform:scale(1.03);} }
    @keyframes lbHitBig { 0%{filter:brightness(3.4) saturate(.4); transform:scale(1.1) translate(-12px,4px);} 20%{transform:scale(1.09) translate(11px,-5px);} 45%{transform:scale(1.07) translate(-7px,3px);} 70%{transform:scale(1.05) translate(4px,-2px);} 100%{filter:none; transform:scale(1.03);} }
    .lb-arena.defeated-still .lb-arena-art { animation:none; filter:brightness(.32) grayscale(.8); transform:scale(1.08); }

    /* 戦闘中：上下に黒帯、敵へ寄る */
    .lb-arena::before, .lb-arena::after { content:''; position:absolute; left:0; right:0; height:0; z-index:4; background:#000; transition:height .28s ease; pointer-events:none; }
    .lb-arena::before { top:0; } .lb-arena::after { bottom:0; }
    .lb-arena.battle::before, .lb-arena.battle::after { height:13%; }
    .lb-arena.battle .lb-arena-name { opacity:0; }
    .lb-arena-name { transition:opacity .2s; }
    .lb-arena.battle .lb-arena-art { animation:none; }
    .lb-arena-art img, .lb-arena-art svg { transition:transform 2.6s ease-out; }
    .lb-arena.battle .lb-arena-art img, .lb-arena.battle .lb-arena-art svg { transform:scale(1.2); }
    .lb-arena.battle.hit .lb-arena-art { animation:lbHit .3s ease both; }
    .lb-arena.battle.hit-big .lb-arena-art { animation:lbHitBig .46s ease both; }
    .lb-arena.battle.guard .lb-arena-art { animation:lbGuard .3s ease both; }
    @keyframes lbGuard { 0%,100%{transform:none; filter:none;} 30%{transform:translateX(4px); filter:brightness(.72) sepia(.5) hue-rotate(-30deg) saturate(2);} 65%{transform:translateX(-3px);} }
    .lb-arena.shattered .lb-arena-art { opacity:0; }
    .lb-arena-art { transition:opacity .3s; }

    .lb-fx { position:absolute; inset:0; z-index:3; pointer-events:none; overflow:hidden; --el:#fff; }
    .lb-fx > * { position:absolute; font-style:normal; }

    /* 溜め：光の粒が中心に集まる */
    .lb-aura { left:50%; top:50%; width:150px; height:150px; margin:-75px 0 0 -75px; border-radius:50%; background:radial-gradient(circle, #fff 2%, var(--el) 26%, transparent 70%); mix-blend-mode:screen; animation:lbAura .62s ease-in forwards; }
    @keyframes lbAura { 0%{opacity:0; transform:scale(.2);} 85%{opacity:1; transform:scale(1.15);} 100%{opacity:0; transform:scale(.25);} }
    .lb-mote { left:50%; top:50%; width:6px; height:6px; margin:-3px 0 0 -3px; border-radius:50%; background:#fff; box-shadow:0 0 10px 3px var(--el); opacity:0; transform:rotate(var(--a)) translateY(calc(var(--d) * -1)); animation:lbMote .56s ease-in var(--t) forwards; }
    @keyframes lbMote { 0%{opacity:0;} 25%{opacity:1;} 100%{opacity:1; transform:rotate(var(--a)) translateY(0) scale(.3);} }

    /* 攻撃の形 */
    .lb-slash { left:-8%; top:8%; width:116%; height:84%; color:var(--el); opacity:0; transform:rotate(var(--r, 0deg)) scaleX(var(--f, 1)); filter:drop-shadow(0 0 3px #fff) drop-shadow(0 0 14px var(--el)); animation:lbSlash .24s ease-out forwards; }
    .lb-slash svg { width:100%; height:100%; display:block; }
    .lb-slash svg .core { fill:#fff; }
    .lb-slash.big { top:-6%; height:112%; }
    @keyframes lbSlash { 0%{opacity:0; clip-path:inset(0 100% 0 0);} 20%{opacity:1;} 62%{opacity:1; clip-path:inset(0 0 0 0);} 100%{opacity:0; clip-path:inset(0 0 0 0);} }
    .lb-thrust { left:-4%; top:calc(50% - 11px + var(--y, 0px)); width:64%; height:22px; border-radius:0 99px 99px 0; background:linear-gradient(90deg, transparent, var(--el) 55%, #fff); filter:drop-shadow(0 0 12px var(--el)); transform-origin:left center; animation:lbThrust .2s cubic-bezier(.3,0,.2,1) forwards; }
    .lb-thrust.big { height:40px; top:calc(50% - 20px + var(--y, 0px)); width:78%; }
    @keyframes lbThrust { 0%{opacity:1; transform:scaleX(0);} 65%{opacity:1; transform:scaleX(1);} 100%{opacity:0; transform:scaleX(1.25);} }
    .lb-blow { left:50%; top:50%; width:120px; height:120px; margin:-60px 0 0 -60px; color:var(--el); filter:drop-shadow(0 0 12px var(--el)); animation:lbBlow .26s ease-out forwards; }
    .lb-blow svg { width:100%; height:100%; display:block; }
    .lb-blow.big { width:190px; height:190px; margin:-95px 0 0 -95px; }
    @keyframes lbBlow { 0%{opacity:0; transform:scale(.2) rotate(-14deg);} 30%{opacity:1; transform:scale(1.1) rotate(0);} 100%{opacity:0; transform:scale(1.5) rotate(8deg);} }

    /* 着弾 */
    .lb-ring { left:50%; top:50%; width:70px; height:70px; margin:-35px 0 0 -35px; border-radius:50%; border:5px solid var(--el); box-shadow:0 0 18px var(--el), inset 0 0 12px var(--el); animation:lbRing .4s ease-out forwards; }
    @keyframes lbRing { 0%{opacity:1; transform:scale(.2);} 100%{opacity:0; transform:scale(4);} }
    .lb-impact { left:50%; top:50%; width:90px; height:90px; margin:-45px 0 0 -45px; border-radius:50%; background:radial-gradient(circle, #fff 12%, var(--el) 42%, transparent 72%); animation:lbImpact .3s ease-out forwards; }
    @keyframes lbImpact { 0%{opacity:0; transform:scale(.2);} 22%{opacity:1;} 100%{opacity:0; transform:scale(3.6);} }
    .lb-spark { left:50%; top:50%; width:4px; height:20px; margin:-10px 0 0 -2px; border-radius:2px; background:linear-gradient(#fff, var(--el)); box-shadow:0 0 6px var(--el); transform:rotate(var(--a)); animation:lbSpark .5s ease-out forwards; }
    @keyframes lbSpark { 0%{opacity:1; transform:rotate(var(--a)) translateY(0);} 100%{opacity:0; transform:rotate(var(--a)) translateY(calc(var(--d) * -1)) scaleY(.35);} }
    .lb-dmg { left:calc(50% + var(--x, 0px) - 70px); width:140px; top:calc(22% + var(--y, 0px)); text-align:center; font-family:"Bebas Neue","Zen Kaku Gothic New",sans-serif; font-size:3.6rem; line-height:1; color:#fff; -webkit-text-stroke:1.5px rgba(0,0,0,.6); text-shadow:0 0 16px var(--el), 0 4px 8px rgba(0,0,0,.85); animation:lbDmg .72s cubic-bezier(.2,.9,.3,1.3) forwards; }
    .lb-dmg.big { font-size:6rem; color:#ffe9a8; top:12%; }
    .lb-dmg.none { left:0; width:100%; font-size:2.1rem; top:38%; color:#c3c3d6; letter-spacing:.08em; text-shadow:0 2px 6px rgba(0,0,0,.9); }
    @keyframes lbDmg { 0%{opacity:0; transform:scale(.3);} 20%{opacity:1; transform:scale(1.3);} 36%{transform:scale(1);} 76%{opacity:1;} 100%{opacity:0; transform:translateY(-18px);} }
    .lb-wash { inset:0; background:radial-gradient(circle at 50% 50%, rgba(255,226,150,.85), transparent 78%); animation:lbWash .55s ease-out forwards; }
    @keyframes lbWash { 0%{opacity:0;} 22%{opacity:1;} 100%{opacity:0;} }
    .lb-rays { left:50%; top:50%; width:220%; aspect-ratio:1; background:repeating-conic-gradient(rgba(255,226,150,.5) 0 9deg, transparent 9deg 24deg); -webkit-mask-image:radial-gradient(circle, #000 15%, transparent 62%); mask-image:radial-gradient(circle, #000 15%, transparent 62%); animation:lbRays 1.1s ease-out forwards; }
    @keyframes lbRays { 0%{opacity:0; transform:translate(-50%,-50%) rotate(0) scale(.45);} 25%{opacity:1;} 100%{opacity:0; transform:translate(-50%,-50%) rotate(42deg) scale(1.15);} }

    /* 属性の爆発 */
    .lb-flame { bottom:6%; left:var(--x); width:var(--s); height:calc(var(--s) * 1.7); border-radius:50% 50% 45% 45% / 70% 70% 30% 30%; background:linear-gradient(0deg, #fff3b0, #ffae34 38%, #ff4a1c 72%, transparent); filter:blur(.5px); opacity:0; animation:lbFlame .62s ease-out var(--t) forwards; }
    @keyframes lbFlame { 0%{opacity:0; transform:translateY(16px) scale(.45);} 22%{opacity:1;} 100%{opacity:0; transform:translateY(calc(var(--h) * -1)) scale(1.15);} }
    .lb-shard { left:50%; top:50%; width:12px; height:42px; margin:-21px 0 0 -6px; background:linear-gradient(#fff, #9fe2ff 45%, #2f7dff); clip-path:polygon(50% 0, 100% 34%, 72% 100%, 28% 100%, 0 34%); filter:drop-shadow(0 0 5px #8fdcff); animation:lbShard .56s cubic-bezier(.15,.8,.3,1) forwards; }
    @keyframes lbShard { 0%{opacity:0; transform:rotate(var(--a)) translateY(0) scale(.4);} 14%{opacity:1;} 72%{opacity:1;} 100%{opacity:0; transform:rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(1.05);} }
    .lb-frost { inset:0; background:radial-gradient(circle at 50% 50%, rgba(200,240,255,.25) 10%, rgba(150,225,255,.8) 88%); animation:lbWash .68s ease-out forwards; }
    .lb-bolt { top:0; left:var(--x); width:58px; height:100%; color:#fff3a0; filter:drop-shadow(0 0 3px #fff) drop-shadow(0 0 12px #ffd900); opacity:0; animation:lbBolt .34s steps(1,end) var(--t) forwards; }
    .lb-bolt svg { width:100%; height:100%; display:block; }
    @keyframes lbBolt { 0%{opacity:1;} 30%{opacity:0;} 45%{opacity:1;} 75%,100%{opacity:0;} }
    .lb-beam { top:-10%; left:var(--x); width:var(--w); height:120%; background:linear-gradient(90deg, transparent, rgba(255,250,210,.95), transparent); filter:blur(1px); transform-origin:top; animation:lbBeam .56s ease-out var(--t) both; }
    @keyframes lbBeam { 0%{opacity:0; transform:scaleX(.2) scaleY(0);} 30%{opacity:1; transform:scaleX(1) scaleY(1);} 100%{opacity:0; transform:scaleX(1.7) scaleY(1);} }
    .lb-void { left:50%; top:50%; width:150px; height:150px; margin:-75px 0 0 -75px; border-radius:50%; background:radial-gradient(circle, #000 42%, #5b1fa8 64%, transparent 74%); box-shadow:0 0 28px #a855ff; animation:lbVoid .58s cubic-bezier(.4,0,.2,1) forwards; }
    @keyframes lbVoid { 0%{opacity:0; transform:scale(.1) rotate(0);} 42%{opacity:1; transform:scale(1.5) rotate(120deg);} 100%{opacity:0; transform:scale(.05) rotate(320deg);} }

    /* 結果の文字と討伐 */
    .lb-tier-slam { left:0; right:0; top:calc(50% - .55em); text-align:center; font-family:"Orbitron",sans-serif; font-weight:900; font-size:2.5rem; line-height:1.1; letter-spacing:.06em; color:#fff; -webkit-text-stroke:1px rgba(0,0,0,.45); text-shadow:0 0 18px var(--tc), 0 4px 8px rgba(0,0,0,.9); animation:lbSlam .8s cubic-bezier(.2,.9,.25,1.2) forwards; }
    @keyframes lbSlam { 0%{opacity:0; transform:scale(3.2);} 26%{opacity:1; transform:scale(.92);} 36%{transform:scale(1);} 82%{opacity:1; transform:scale(1.04);} 100%{opacity:0; transform:scale(1.12);} }
    .lb-defeat-stamp { left:0; right:0; top:calc(50% - .55em); text-align:center; font-family:"Bebas Neue","Zen Kaku Gothic New",sans-serif; font-size:3.6rem; line-height:1.1; letter-spacing:.12em; color:#ffd24a; text-shadow:0 0 18px rgba(255,210,74,.9), 0 4px 8px rgba(0,0,0,.9); animation:lbStamp .4s cubic-bezier(.2,.9,.3,1.3) both; }
    @keyframes lbStamp { 0%{opacity:0; transform:scale(2.6);} 100%{opacity:1; transform:scale(1);} }
    .lb-piece { inset:0; overflow:hidden; clip-path:var(--clip); animation:lbPiece .86s cubic-bezier(.2,.65,.4,1) forwards; }
    .lb-piece img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scale(1.2); }
    @keyframes lbPiece { 0%{opacity:1; transform:none; filter:brightness(2.4);} 22%{filter:brightness(1.2);} 100%{opacity:0; transform:translate(var(--dx), var(--dy)) rotate(var(--rot));} }

    .lb-screen-flash { position:fixed; inset:0; z-index:1; pointer-events:none; background:var(--c, #fff); animation:lbScreenFlash var(--ms, 260ms) ease-out forwards; }
    @keyframes lbScreenFlash { 0%{opacity:0;} 22%{opacity:var(--o, .4);} 100%{opacity:0;} }
    #login-bonus-box.lb-shake { animation:lbBoxShake .26s ease; }
    @keyframes lbBoxShake { 0%,100%{transform:translate(0,0);} 22%{transform:translate(-6px,3px);} 45%{transform:translate(5px,-3px);} 70%{transform:translate(-3px,2px);} }
    #login-bonus-box.lb-shake-big { animation:lbBoxShakeBig .48s ease; }
    @keyframes lbBoxShakeBig { 0%,100%{transform:translate(0,0) rotate(0);} 12%{transform:translate(-13px,7px) rotate(-1deg);} 28%{transform:translate(12px,-8px) rotate(1deg);} 44%{transform:translate(-9px,5px) rotate(-.6deg);} 62%{transform:translate(6px,-4px) rotate(.4deg);} 80%{transform:translate(-3px,2px);} }

    .lb-hearts-wrap { display:flex; align-items:center; justify-content:center; gap:8px; min-height:30px; padding:6px 12px; }
    .lb-hearts { display:flex; gap:3px; }
    .lb-hearts.bump { animation:lbHeartsBump .16s ease; }
    @keyframes lbHeartsBump { 50%{transform:scale(1.05);} }
    .lb-heart { position:relative; width:16px; height:16px; }
    .lb-heart-track, .lb-heart-red, .lb-heart-blue { position:absolute; inset:0; overflow:hidden; }
    .lb-heart svg { display:block; width:16px; height:16px; fill:currentColor; }
    .lb-heart-track { color:rgba(255,255,255,0.15); width:100%; }
    .lb-heart-red { color:#e0607a; }
    .lb-heart-blue { color:#5fd0e6; }
    .lb-damage-note { flex-shrink:0; font-size:0.76rem; color:#ff8a8a; font-weight:bold; font-variant-numeric:tabular-nums; }

    .lb-lower { position:relative; padding:4px 16px 18px; }
    #lb-screen-picker { padding-top:10px; }
    .lb-group { margin-bottom:18px; }
    .lb-group-label { font-size:0.8rem; color:var(--text-secondary); margin-bottom:9px; font-weight:bold; }
    .lb-pick-row { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
    #lb-element-row { grid-template-columns:repeat(6, 1fr); }
    .lb-pick.attr-btn { width:100%; height:48px; padding:0; margin:0; font-size:1rem; font-weight:bold; border-radius:9px; opacity:.88; transition:transform .12s, background .12s, opacity .12s; }
    .lb-pick.attr-btn:hover { opacity:1; }
    .lb-pick.attr-btn:active { transform:scale(.94); }
    .lb-pick.attr-btn.active { opacity:1; transform:translateY(-1px); background:color-mix(in srgb, currentColor 24%, transparent); box-shadow:0 0 0 2px currentColor, 0 0 12px color-mix(in srgb, currentColor 50%, transparent); }
    .attr-btn.attr-斬 { border-color:#b899e8; color:#b899e8; }
    .attr-btn.attr-斬:hover { background:rgba(184,153,232,0.15); }
    .attr-btn.attr-突 { border-color:#f7b733; color:#f7b733; }
    .attr-btn.attr-突:hover { background:rgba(247,183,51,0.15); }
    .attr-btn.attr-打 { border-color:#8fc93f; color:#8fc93f; }
    .attr-btn.attr-打:hover { background:rgba(143,201,63,0.15); }

    .lb-day7-tip { font-size:0.74rem; padding:8px 10px; border-radius:8px; margin-bottom:16px; background:rgba(255,122,140,0.12); border:1px solid rgba(255,122,140,0.45); color:#ff9aa8; line-height:1.55; }
    .lb-day7-tip[hidden], .lb-helper[hidden] { display:none; }
    .lb-cta { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; gap:8px; width:100%; min-height:52px; margin-top:22px; border-radius:11px; cursor:pointer; font-family:inherit; font-weight:800; font-size:1.02rem; letter-spacing:0.08em; color:#2a1d08; background:linear-gradient(180deg,#f3d98f,#c9a052); border:1px solid #f6e3ad; box-shadow:0 8px 22px -10px rgba(212,175,106,0.85); transition:transform .12s, opacity .15s, filter .15s; }
    .lb-cta::before { content:''; position:absolute; top:0; left:-60%; width:40%; height:100%; background:linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent); transform:skewX(-20deg); animation:lbCtaShimmer 3s infinite; }
    @keyframes lbCtaShimmer { 0%{left:-60%;} 55%{left:120%;} 100%{left:120%;} }
    .lb-cta:hover:not(:disabled) { filter:brightness(1.07); }
    .lb-cta:active:not(:disabled) { transform:scale(.98); }
    .lb-cta:disabled { cursor:not-allowed; color:rgba(232,232,240,0.55); background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.14); box-shadow:none; }
    .lb-cta:disabled::before { display:none; }
    .lb-cta:focus-visible, .lb-pick.attr-btn:focus-visible, #lb-close-btn:focus-visible { outline:2px solid #fff; outline-offset:2px; }
    .lb-spin { width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; animation:lbSpin .7s linear infinite; }
    @keyframes lbSpin { to { transform:rotate(360deg); } }
    .lb-helper { text-align:center; font-size:0.74rem; color:var(--text-muted); margin-top:10px; }

    #lb-stage .lb-screen[hidden] { display:none; }
    #lb-screen-picker:not([hidden]) { animation:lbScreenIn .3s ease both; }
    @keyframes lbScreenIn { from{opacity:0; transform:translateY(5px);} to{opacity:1; transform:none;} }

    /* 判定：武器と属性の札をめくる */
    .lb-judges { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; perspective:500px; }
    .lb-judge { position:relative; height:54px; transform-style:preserve-3d; transition:transform .34s cubic-bezier(.3,.9,.4,1.2); }
    .lb-judge.open { transform:rotateX(180deg); }
    .lb-judge.pop { animation:lbJudgePop .34s cubic-bezier(.2,.9,.3,1.5); }
    @keyframes lbJudgePop { 0%{scale:1;} 45%{scale:1.1;} 100%{scale:1;} }
    .lb-judge.pop.weak .front { box-shadow:0 0 18px rgba(46,204,113,.75); }
    .lb-judge.pop.resist .front { box-shadow:0 0 18px rgba(231,76,60,.7); }
    .lb-judge-face { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:9px; border-radius:10px; backface-visibility:hidden; -webkit-backface-visibility:hidden; border:1px solid var(--border-light); background:var(--bg-card2); font-weight:bold; }
    .lb-judge-face.back { font-size:1.1rem; color:var(--text-muted); animation:lbJudgeWait .75s ease-in-out infinite; }
    .lb-judge-face.front { transform:rotateX(180deg); visibility:hidden; } /* めくるまでは中身を確実に隠す（裏返しの非表示が効かないブラウザ対策） */
    .lb-judge.open .lb-judge-face.front { visibility:visible; transition:visibility 0s .15s; }
    .lb-judge.open .lb-judge-face.back { visibility:hidden; animation:none; transition:visibility 0s .15s; }
    @keyframes lbJudgeWait { 50%{border-color:rgba(212,175,106,0.75); color:#f0d08a; background:rgba(212,175,106,0.1);} }
    .lb-judge-key { opacity:1; pointer-events:none; display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:7px; font-size:1rem; }
    .lb-judge-val { font-size:0.95rem; }
    .lb-judge.weak .front { border-color:rgba(46,204,113,0.65); background:rgba(46,204,113,0.16); } .lb-judge.weak .lb-judge-val { color:#5dde8e; }
    .lb-judge.resist .front { border-color:rgba(231,76,60,0.65); background:rgba(231,76,60,0.15); } .lb-judge.resist .lb-judge-val { color:#ff8a8a; }
    .lb-judge.neutral .lb-judge-val { color:var(--text-secondary); }
    .lb-judge .lb-judge-face.back .lb-judge-val { color:inherit; } /* めくる前は判定の色を出さない */
    .lb-judge.void .front { border-color:rgba(153,153,187,0.7); background:rgba(153,153,187,0.14); } .lb-judge.void .lb-judge-val { color:#c9c9de; }

    /* 演出の順に出す部分 */
    .lb-reveal { opacity:0; visibility:hidden; transform:translateY(6px); transition:opacity .28s, transform .28s; }
    .lb-reveal.on { opacity:1; visibility:visible; transform:none; }

    .lb-verdict { padding:10px 14px; text-align:center; border-radius:11px; margin-bottom:10px; border:1px solid var(--border); position:relative; overflow:hidden; }
    .lb-tier { font-family:"Orbitron",sans-serif; font-size:1.05rem; font-weight:800; letter-spacing:0.08em; }
    .lb-flavor { font-size:0.72rem; line-height:1.45; color:var(--text-secondary); margin-top:3px; }
    .lb-flavor span { display:inline-block; } /* 読点の区切りで折り返す */
    .lb-pt { display:flex; align-items:baseline; justify-content:center; gap:10px; margin-bottom:10px; }
    .lb-pt-label { font-size:0.74rem; color:var(--text-muted); }
    .lb-pt.go .lb-pt-value { animation:lbPtPop .4s cubic-bezier(.2,.9,.3,1.5); display:inline-block; }
    @keyframes lbPtPop { 50%{transform:scale(1.28);} }
    .lb-pt-value { font-size:1.5rem; line-height:1.15; font-weight:bold; color:#f0d08a; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .lb-verdict.tone-danger { background:rgba(231,76,60,0.14); border-color:var(--danger); } .tone-danger .lb-tier { color:#ff8a8a; }
    .lb-verdict.tone-warning { background:rgba(243,156,18,0.14); border-color:var(--warning); } .tone-warning .lb-tier { color:#f5b041; }
    .lb-verdict.tone-neutral { background:var(--bg-card2); } .tone-neutral .lb-tier { color:#d6d6e6; }
    .lb-verdict.tone-success { background:rgba(46,204,113,0.14); border-color:var(--success); } .tone-success .lb-tier { color:#5dde8e; }
    .lb-verdict.tone-jackpot { background:linear-gradient(180deg, rgba(255,215,0,0.2), rgba(255,215,0,0.06)); border-color:#ffd700; } .tone-jackpot .lb-tier { color:#ffd700; }
    .lb-verdict.tone-jackpot.on { animation:lbJackpotGlow 1.6s ease-in-out infinite; }
    @keyframes lbJackpotGlow { 0%,100%{box-shadow:0 0 10px 1px rgba(255,215,0,0.25);} 50%{box-shadow:0 0 22px 4px rgba(255,215,0,0.55);} }

    .lb-defeat-banner { font-size:0.8rem; font-weight:bold; color:#ffd700; text-align:center; background:rgba(255,215,0,0.12); border:1px solid rgba(255,215,0,0.4); border-radius:9px; padding:8px 10px; margin-bottom:10px; }
    .lb-forced-note { font-size:0.74rem; color:#c9c9de; background:var(--none-bg); border:1px solid var(--none); border-radius:8px; padding:7px 10px; margin-bottom:10px; }
    .lb-chart { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
    .lb-group-line { display:flex; align-items:center; gap:10px; padding:5px 10px; border-radius:8px; background:var(--bg-primary); border:1px solid transparent; }
    .lb-gl-label { flex-shrink:0; font-size:0.68rem; font-weight:bold; padding:2px 8px; border-radius:4px; white-space:nowrap; }
    .lb-group-line.weak { border-color:rgba(46,204,113,0.3); } .lb-group-line.weak .lb-gl-label { background:rgba(46,204,113,0.2); color:#5dde8e; }
    .lb-group-line.resist { border-color:rgba(231,76,60,0.3); } .lb-group-line.resist .lb-gl-label { background:rgba(231,76,60,0.2); color:#ff8a8a; }
    .lb-group-line.neutral .lb-gl-label { background:rgba(255,255,255,0.08); color:var(--text-secondary); }
    .lb-gl-items { flex:1; font-size:0.86rem; }
    .lb-gi { color:var(--text-secondary); }
    .lb-gi.picked { color:#fff; font-weight:bold; background:var(--bg-card2); border:1px solid var(--border-light); border-radius:5px; padding:1px 6px; }
    .lb-gi-sep { color:var(--text-muted); margin:0 2px; }
    .lb-skip-hint { position:absolute; left:0; right:0; bottom:18px; text-align:center; font-size:0.7rem; color:var(--text-muted); }

    @media (prefers-reduced-motion:reduce) {
      #login-bonus-box, .lb-arena-art, #lb-screen-picker, .lb-judge-face.back, .lb-judge.pop, .lb-verdict.tone-jackpot.on, .lb-cta::before, .lb-day-medal.just { animation:none !important; }
      .lb-reveal, .lb-judge, .lb-day-track-fill, .lb-pick.attr-btn { transition:none !important; }
    }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'login-bonus-modal';
  modal.innerHTML = `
    <div id="login-bonus-box">
      <div class="lb-head"><span class="lb-eyebrow">DAILY BATTLE</span><h3>デイリーバトル</h3><span class="lb-preview-tag">確認用</span></div>
      <div class="lb-day-track">
        <div class="lb-day-track-line"><div class="lb-day-track-fill" id="lb-day-track-fill"></div></div>
        <div class="lb-day-medals" id="lb-day-medals"></div>
      </div>
      <div id="lb-stage">
        <div class="lb-arena" id="lb-arena">
          <div class="lb-arena-art" id="lb-arena-art"></div>
          <div class="lb-arena-name" id="lb-arena-name"></div>
          <div class="lb-fx" id="lb-fx"></div>
        </div>
        <div class="lb-hearts-wrap" id="lb-hearts-wrap"></div>
        <div class="lb-lower" id="lb-lower">
          <div class="lb-screen" id="lb-screen-picker">
            <div class="lb-group"><div class="lb-group-label">武器属性</div><div class="lb-pick-row" id="lb-weapon-row"></div></div>
            <div class="lb-group"><div class="lb-group-label">元素属性</div><div class="lb-pick-row" id="lb-element-row"></div></div>
            <div class="lb-day7-tip" id="lb-day7-tip" hidden>7日目は耐性のない特別な敵。無属性で安定を取るより、通常属性を狙う方が有利かも。</div>
            <button type="button" class="lb-cta" id="lb-challenge-btn" disabled>挑戦する</button>
            <div class="lb-helper" id="lb-helper">武器と属性をひとつずつ選んでください</div>
            <button type="button" class="btn btn-secondary lb-preview-cancel" id="lb-preview-cancel">閉じる</button>
          </div>
          <div class="lb-screen" id="lb-screen-result" aria-live="polite" hidden></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('lb-challenge-btn').addEventListener('click', lbChallenge);
  document.getElementById('lb-preview-cancel').addEventListener('click', lbEndPreview);

  try {
    const [status, specials] = await Promise.all([
      apiFetch('/auth/login-bonus'),
      apiFetch('/auth/special-bonuses').catch(() => [])
    ]);

    // 特別ボーナスは別のポップアップ。デイリーバトルがまだならその後に、済んでいればすぐに出す
    const hasClaimableSpecial = specials.some(spBonusCanClaim);
    // デイリーバトルのモーダルは非表示のまま残す（renderNav が再実行されたときに二重に確認しないための目印）
    if (status.already_claimed) {
      if (hasClaimableSpecial) openSpecialBonusModal(specials);
      return;
    }
    window._lbPendingSpecials = hasClaimableSpecial ? specials : null;

    window._lbLoginDone = status.already_claimed;
    renderLbEnemyCard(status.boss_enemy);

    if (!status.already_claimed) {
      renderLbDayTrack(status.next_streak, status.is_day7);
      renderLbPickers(status.is_day7);
    } else {
      renderLbDayTrack(status.streak, status.streak === 7);
      document.getElementById('lb-screen-picker').hidden = true;
    }

    document.getElementById('login-bonus-modal').classList.add('open');
    lockBodyScroll();
  } catch {}
}

function lbEnemyPlaceholderSvg() {
  return `<svg viewBox="0 0 200 200" width="280" height="280" aria-hidden="true">
    <defs>
      <radialGradient id="lb-glow" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stop-color="#ffd700" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#ffd700" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="95" fill="url(#lb-glow)"/>
    <path d="M100 28 C 58 28 36 72 36 122 C 36 154 60 176 100 176 C 140 176 164 154 164 122 C 164 72 142 28 100 28 Z" fill="#12101f" stroke="#8888aa" stroke-width="2" stroke-opacity="0.4"/>
    <circle cx="78" cy="108" r="7" fill="#ffd700"/>
    <circle cx="122" cy="108" r="7" fill="#ffd700"/>
  </svg>`;
}

// 1行・20個のハート(1個=2HP)。後半10個(HP21〜40)が水色で先に減り、
// 無くなると前半10個(HP1〜20、ピンク)が減り始める＝水色の裏にピンクがある見た目。
// 1行10個(1個=4HP)。各ハートの中で上半分(2HP)を水色、下半分(2HP)をピンクとし、
// 水色をピンクの手前に重ねて描画。水色が減って初めて裏のピンクが見える。
// 1行10個。HPが上半分(21〜40)の間は青10個がHP20相当で減っていき、
// 20を切った瞬間に色がピンクに切り替わり、また10個フルから減り始める（完全な段階制）。
// 左10個=青(HP21〜40分、先に減る)、右10個=赤(HP1〜20分、青が尽きてから減る)を
// 常に両方表示し、左側から順番に空になっていく。
// 1行10個。HP21〜40の間は「青→赤」、HP1〜20の間は「赤→空」の2段階で、
// 左のハートほど最後まで残り、右のハートから先に色が変わっていく。
const LB_HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2.4 4 6.3 4 8.7 4 10.7 5.3 12 7.3 13.3 5.3 15.3 4 17.7 4c3.9 0 5.9 4.3 4.3 7.7C19.5 16.4 12 21 12 21z"/></svg>';
function lbHeartsHTML(hp, maxHp = 40) {
  if (hp == null) return '';
  const totalHearts = 10;
  const half = maxHp / 2; // 20
  const perHeart = half / totalHearts; // 2
  const inUpperPhase = hp > half;
  const phaseHp = inUpperPhase ? hp - half : hp; // 現フェーズの残りHP(0〜20)
  let html = '';
  for (let i = 0; i < totalHearts; i++) {
    const val = Math.max(0, Math.min(perHeart, phaseHp - i * perHeart));
    const pct = (val / perHeart) * 100;
    const redWidth = inUpperPhase ? 100 : pct;
    const blueWidth = inUpperPhase ? pct : 0;
    html += `<span class="lb-heart">
      <span class="lb-heart-track">${LB_HEART}</span>
      <span class="lb-heart-red" style="width:${redWidth}%">${LB_HEART}</span>
      <span class="lb-heart-blue" style="width:${blueWidth}%">${LB_HEART}</span>
    </span>`;
  }
  return `<div class="lb-hearts" role="img" aria-label="残りHP ${hp}/${maxHp}">${html}</div>`;
}

function renderLbEnemyCard(boss) {
  // 表示は最大400px幅なので、元画像ではなく幅640px・画質自動の変換版を使う（毎ログイン表示されるため帯域節約）
  document.getElementById('lb-arena-art').innerHTML = boss.image_url
    ? `<img src="${escHtml(mediumUrl(boss.image_url))}" alt="${escHtml(boss.name)}">`
    : lbEnemyPlaceholderSvg();
  document.getElementById('lb-arena-name').textContent = boss.name;
  document.getElementById('lb-hearts-wrap').innerHTML = lbHeartsHTML(boss.hp, boss.max_hp);
}

function renderLbDayTrack(day, isDay7, justCleared = false) {
  const wrap = document.getElementById('lb-day-medals');
  wrap.innerHTML = '';
  for (let i = 1; i <= 7; i++) {
    const d = document.createElement('div');
    d.className = 'lb-day-medal';
    if (i === 7) d.classList.add('day7');
    if (i < day) d.classList.add('done');
    if (i === day) d.classList.add('today');
    if (i === day && justCleared) d.classList.add('just');
    d.innerHTML = i === 7 ? `7<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3 6.6 7 .8-5.2 4.8 1.4 7L12 17.7 5.8 21.2l1.4-7L2 9.4l7-.8z"/></svg>` : i;
    wrap.appendChild(d);
  }
  document.getElementById('lb-day-track-fill').style.width = ((Math.max(day, 1) - 1) / 6 * 100) + '%';
}

function renderLbPickers(isDay7) {
  _lbWeaponPick = null;
  _lbElementPick = null;
  const wRow = document.getElementById('lb-weapon-row');
  wRow.innerHTML = LB_WEAPONS.map(w => `<button type="button" class="attr-btn lb-pick attr-${w}" data-kind="weapon" data-key="${w}">${w}</button>`).join('');
  const eRow = document.getElementById('lb-element-row');
  eRow.innerHTML = LB_ELEMENTS.map(e => `<button type="button" class="attr-btn lb-pick attr-${e}" data-kind="element" data-key="${e}">${e}</button>`).join('');
  [...wRow.children, ...eRow.children].forEach(b => b.addEventListener('click', () => lbPick(b)));
  document.getElementById('lb-day7-tip').hidden = !isDay7;
}

function lbPick(btn) {
  const kind = btn.dataset.kind;
  const row = kind === 'weapon' ? document.getElementById('lb-weapon-row') : document.getElementById('lb-element-row');
  [...row.children].forEach(b => b.classList.toggle('active', b === btn));
  if (kind === 'weapon') _lbWeaponPick = btn.dataset.key; else _lbElementPick = btn.dataset.key;
  const ready = _lbWeaponPick && _lbElementPick;
  document.getElementById('lb-challenge-btn').disabled = !ready;
  document.getElementById('lb-helper').hidden = !!ready;
}

async function lbChallenge() {
  if (!_lbWeaponPick || !_lbElementPick) return;
  const btn = document.getElementById('lb-challenge-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="lb-spin" aria-hidden="true"></span>挑戦中...';
  try {
    // 確認用はサーバーに送らない（ポイントも連続日数も変わらない）
    const res = _lbPreview ? lbPreviewResult(_lbWeaponPick, _lbElementPick) : await apiFetch('/auth/login-bonus', {
      method: 'POST',
      body: JSON.stringify({ weapon: _lbWeaponPick, element: _lbElementPick })
    });
    showLbResult(res);
    playLbBattle(res);
  } catch (err) {
    showMessage(err.message);
    btn.disabled = false;
    btn.textContent = '挑戦する';
  }
}

function lbJoinItems(items) {
  return items.map(it => `<span class="lb-gi ${it.picked ? 'picked' : ''}">${it.k}</span>`).join('<span class="lb-gi-sep">・</span>');
}

const LB_JUDGE_LABEL = { weak: '弱点', neutral: '等倍', resist: '耐性', void: '貫通' };
const LB_ELEMENT_COLOR = { 火: 'var(--fire)', 氷: 'var(--ice)', 雷: 'var(--thunder)', 光: 'var(--light)', 闇: 'var(--dark)', 無: 'var(--none)' };

function lbJudgeHTML(key, status) {
  return `<div class="lb-judge ${status}">
    <div class="lb-judge-face back"><span class="attr-btn attr-${key} lb-judge-key">${key}</span><span class="lb-judge-val">?</span></div>
    <div class="lb-judge-face front"><span class="attr-btn attr-${key} lb-judge-key">${key}</span><span class="lb-judge-val">${LB_JUDGE_LABEL[status]}</span></div>
  </div>`;
}

// 結果の中身を先に作り、演出の順に見せていく（途中で飛ばしても最後の状態がそのまま残る）
function showLbResult(res) {
  const tier = LB_TIERS[String(res.total)];
  const groups = { weak: [], neutral: [], resist: [] };
  LB_WEAPONS.forEach(w => groups[res.weapon_map[w]].push({ k: w, picked: w === res.picked_weapon }));
  LB_ELEMENTS.filter(e => e !== '無').forEach(e => groups[res.element_map[e]].push({ k: e, picked: e === res.picked_element }));

  const rows = [];
  if (groups.weak.length) rows.push(`<div class="lb-group-line weak"><span class="lb-gl-label">弱点</span><span class="lb-gl-items">${lbJoinItems(groups.weak)}</span></div>`);
  if (groups.resist.length) rows.push(`<div class="lb-group-line resist"><span class="lb-gl-label">耐性</span><span class="lb-gl-items">${lbJoinItems(groups.resist)}</span></div>`);
  if (groups.neutral.length) rows.push(`<div class="lb-group-line neutral"><span class="lb-gl-label">等倍</span><span class="lb-gl-items">${lbJoinItems(groups.neutral)}</span></div>`);

  const picker = document.getElementById('lb-screen-picker');
  const result = document.getElementById('lb-screen-result');
  // 選ぶ画面と結果で高さが変わって画像が動かないよう、選ぶ画面の高さを残す
  document.getElementById('lb-lower').style.minHeight = `${document.getElementById('lb-lower').offsetHeight}px`;
  result.innerHTML = `
    <div class="lb-judges">
      ${lbJudgeHTML(res.picked_weapon, res.weapon_map[res.picked_weapon])}
      ${lbJudgeHTML(res.picked_element, res.element_map[res.picked_element])}
    </div>
    <div class="lb-verdict ${tier.tone} lb-reveal" id="lb-verdict">
      <div class="lb-tier">${tier.label}</div>
      <div class="lb-flavor">${tier.flavor.split(/(?<=、)/).map(x => `<span>${x}</span>`).join('')}</div>
    </div>
    <div class="lb-pt lb-reveal" id="lb-pt-box"><span class="lb-pt-label">獲得ポイント</span><span class="lb-pt-value">+<span id="lb-pt-num">0</span>pt</span></div>
    <div class="lb-reveal lb-reveal-last">
      ${res.forced ? '<div class="lb-forced-note">貫通クリティカルには弱点も耐性も関係なかった。</div>' : ''}
      ${res.boss_defeated ? `<div class="lb-defeat-banner">${uiIconInline('trophy')}「${escHtml(res.awarded_title)}」の称号を獲得！ 次の敵が現れた</div>` : ''}
      <div class="lb-chart">${rows.join('')}</div>
      <button class="btn btn-primary" style="width:100%" id="lb-close-btn">${t('close')}</button>
    </div>
    <div class="lb-skip-hint" id="lb-skip-hint">${t('rn.skip')}</div>
  `;
  picker.hidden = true;
  result.hidden = false;
  document.getElementById('lb-close-btn').addEventListener('click', () => {
    if (_lbPreview) { lbEndPreview(); return; }
    document.getElementById('login-bonus-modal').classList.remove('open');
    unlockBodyScroll();
    if (window._lbPendingSpecials) {
      const specials = window._lbPendingSpecials;
      window._lbPendingSpecials = null;
      setTimeout(() => openSpecialBonusModal(specials), 250);
    }
  });
  if (!_lbPreview) window._lbLoginDone = true;
}

// ===== 管理画面の確認用：本物と同じ画面を、サーバーに送らずに動かす =====
// opts: { boss: { name, image_url }, total: -2〜2, defeat, day: 1〜7, points: { '-2': pt, ... } }
function openLbPreview(opts) {
  const modal = document.getElementById('login-bonus-modal');
  if (!modal) return;
  // 討伐の確認はHPを1にして、当たれば倒れるようにする
  _lbPreview = { ...opts, hp: opts.defeat ? 1 : 33 };
  modal.dataset.preview = '1';
  const arena = document.getElementById('lb-arena');
  arena.classList.remove('hit', 'hit-big', 'defeated', 'defeated-still');
  document.getElementById('lb-fx').innerHTML = '';
  document.getElementById('lb-lower').style.minHeight = '';
  const result = document.getElementById('lb-screen-result');
  result.hidden = true;
  result.innerHTML = '';
  const picker = document.getElementById('lb-screen-picker');
  picker.hidden = false;
  const btn = document.getElementById('lb-challenge-btn');
  btn.disabled = true;
  btn.textContent = '挑戦する';
  document.getElementById('lb-helper').hidden = false;
  renderLbEnemyCard({ ...opts.boss, hp: _lbPreview.hp, max_hp: 40 });
  renderLbDayTrack(opts.day, opts.day === 7);
  renderLbPickers(opts.day === 7);
  modal.classList.add('open');
  lockBodyScroll();
}

function lbEndPreview() {
  const modal = document.getElementById('login-bonus-modal');
  modal.classList.remove('open');
  delete modal.dataset.preview;
  _lbPreview = null;
  unlockBodyScroll();
}

// 選んだ武器・属性が、指定の判定になるように相性表を作る（本物と同じ形の結果を返す）
function lbPreviewResult(weapon, element) {
  const p = _lbPreview;
  const forced = element === '無';
  const total = forced ? 0 : p.total;
  const [wPick, ePick] = { 2: ['weak', 'weak'], 1: ['weak', 'neutral'], 0: ['neutral', 'neutral'], '-1': ['neutral', 'resist'], '-2': ['resist', 'resist'] }[total];
  const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  const fill = (keys, picked, status, slots) => {
    const i = slots.indexOf(status);
    if (i >= 0) slots.splice(i, 1); else slots.pop();
    const rest = shuffle(slots), map = {};
    keys.forEach(k => { map[k] = k === picked ? status : rest.pop(); });
    return map;
  };
  const day7 = p.day === 7;
  const weapon_map = fill(LB_WEAPONS, weapon, wPick, day7 ? ['weak', 'neutral', 'neutral'] : ['weak', 'neutral', 'resist']);
  const elementKeys = LB_ELEMENTS.filter(e => e !== '無');
  const element_map = fill(elementKeys, forced ? elementKeys[0] : element, forced ? 'neutral' : ePick, day7 ? ['weak', 'weak', 'neutral', 'neutral', 'neutral'] : ['weak', 'weak', 'neutral', 'resist', 'resist']);
  element_map.無 = 'void';
  const damage = { '-2': 0, '-1': 1, 0: 2, 1: 3, 2: 5 }[total];
  const after = Math.max(0, p.hp - damage);
  const defeated = after === 0;
  return {
    streak: p.day, is_day7: day7, points_earned: p.points[String(total)] ?? 0, total, forced,
    picked_weapon: weapon, picked_element: element, weapon_map, element_map, boss_enemy: p.boss,
    boss_hp_before: p.hp, boss_hp_after: after, boss_max_hp: 40, boss_defeated: defeated,
    awarded_title: defeated ? `${p.boss.name}討伐` : null,
  };
}

const LB_BLOW_SVG = '<svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"><path d="M50 0l9 27 22-17-9 26 28 2-23 16 19 21-28-5 2 28-20-20-20 20 2-28-28 5 19-21L0 38l28-2-9-26 22 17z"/><path d="M50 26l5 15 13-9-5 14 15 1-13 9 10 11-15-3 1 15-11-11-11 11 1-15-15 3 10-11-13-9 15-1-5-14 13 9z" fill="#fff"/></svg>';
const LB_BOLT_SVG = '<svg viewBox="0 0 40 200" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" aria-hidden="true"><path d="M26 0L10 56l18-6L8 116l20-8-16 92"/></svg>';
// 結果の文字色
const LB_SLAM_COLOR = { '-2': '#ff5a5a', '-1': '#ff9f3a', 0: '#a9b8ff', 1: '#3fdc85', 2: '#ffd24a' };
// 手数と1発ごとのダメージ（合計が実際のダメージになるよう、最後の1発に残りを乗せる）
function lbHitPlan(total, damage) {
  const n = { '2': 3, '1': 2 }[String(total)] || 1;
  if (damage <= 0) return [0];
  const hits = Math.min(n, damage), plan = Array(hits).fill(1);
  plan[hits - 1] = damage - (hits - 1);
  return plan;
}

function lbFxAdd(fx, html) { fx.insertAdjacentHTML('beforeend', html); }
function lbRnd(a, b) { return a + Math.random() * (b - a); }

function lbChargeFx(fx) {
  let html = '<i class="lb-aura"></i>';
  for (let i = 0; i < 16; i++) html += `<i class="lb-mote" style="--a:${Math.round(i * 22.5)}deg;--d:${Math.round(lbRnd(90, 150))}px;--t:${Math.round(lbRnd(0, 170))}ms"></i>`;
  lbFxAdd(fx, html);
}

// 武器で形を変える（斬：弧、突：一直線、打：星形の衝撃）。last は最後の1発
function lbStrikeFx(fx, weapon, i, last, mega) {
  const big = last && mega ? ' big' : '';
  if (weapon === '斬') {
    const pose = [['-4deg', 1], ['8deg', -1], ['-14deg', 1]][i % 3];
    const one = (r, f) => `<i class="lb-slash${big}" style="--r:${r};--f:${f}"><svg viewBox="0 0 200 100" preserveAspectRatio="none" fill="currentColor" aria-hidden="true"><path d="M0 98C62 80 134 42 200 2 146 60 74 92 0 98Z"/><path class="core" d="M20 92C74 76 136 44 186 12 140 56 78 86 20 92Z"/></svg></i>`;
    lbFxAdd(fx, one(pose[0], pose[1]));
    if (big) lbFxAdd(fx, one('10deg', -1)); // PERFECT の締めは十字
  } else if (weapon === '突') {
    const y = [0, -24, 22][i % 3];
    lbFxAdd(fx, `<i class="lb-thrust${big}" style="--y:${y}px"></i>`);
  } else {
    lbFxAdd(fx, `<i class="lb-blow${big}">${LB_BLOW_SVG}</i>`);
  }
}

// 属性ごとの爆発（big は締めの1発）
function lbElementFx(fx, element, big) {
  let html = '';
  if (element === '火') {
    const n = big ? 22 : 11;
    for (let i = 0; i < n; i++) html += `<i class="lb-flame" style="--x:${Math.round(lbRnd(10, 86))}%;--s:${Math.round(lbRnd(18, big ? 46 : 32))}px;--h:${Math.round(lbRnd(80, big ? 210 : 140))}px;--t:${Math.round(lbRnd(0, 130))}ms"></i>`;
  } else if (element === '氷') {
    const n = big ? 18 : 10;
    for (let i = 0; i < n; i++) html += `<i class="lb-shard" style="--a:${Math.round(i * 360 / n + lbRnd(-8, 8))}deg;--d:${Math.round(lbRnd(80, big ? 190 : 130))}px"></i>`;
    html += '<i class="lb-frost"></i>';
  } else if (element === '雷') {
    const n = big ? 5 : 2;
    for (let i = 0; i < n; i++) html += `<i class="lb-bolt" style="--x:${Math.round(lbRnd(8, 80))}%;--t:${i * 45}ms">${LB_BOLT_SVG}</i>`;
  } else if (element === '光') {
    const n = big ? 7 : 3;
    for (let i = 0; i < n; i++) html += `<i class="lb-beam" style="--x:${Math.round(lbRnd(4, 80))}%;--w:${Math.round(lbRnd(26, big ? 78 : 50))}px;--t:${i * 40}ms"></i>`;
  } else if (element === '闇') {
    html = '<i class="lb-void"></i>';
    if (big) html += '<i class="lb-void" style="animation-delay:.1s;opacity:0"></i>';
  } else {
    html = '<i class="lb-ring"></i><i class="lb-ring" style="animation-delay:.08s"></i>';
  }
  lbFxAdd(fx, html);
}

function lbImpactFx(fx, n) {
  let html = '<i class="lb-impact"></i><i class="lb-ring"></i>';
  for (let i = 0; i < n; i++) html += `<i class="lb-spark" style="--a:${Math.round(i * 360 / n + lbRnd(0, 16))}deg;--d:${Math.round(lbRnd(70, 165))}px"></i>`;
  lbFxAdd(fx, html);
}

// 画面全体の閃光（点滅が強くなりすぎないよう、薄めで1回の演出につき数回まで）
function lbScreenFlash(color, opacity, ms) {
  const el = document.createElement('div');
  el.className = 'lb-screen-flash';
  el.style.cssText = `--c:${color};--o:${opacity};--ms:${ms}ms`;
  document.getElementById('login-bonus-modal').appendChild(el);
  setTimeout(() => el.remove(), ms + 40);
}

function lbRestartClass(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// 討伐：敵の画像を破片にして飛ばす（画像がない敵は暗くなるだけ）
function lbShatter(arena, fx) {
  const img = arena.querySelector('.lb-arena-art img');
  if (!img) return;
  arena.classList.add('shattered');
  const cols = 4, rows = 3;
  const pt = (c, r) => [c / cols * 100 + (c % cols ? lbRnd(-5, 5) : 0), r / rows * 100 + (r % rows ? lbRnd(-7, 7) : 0)];
  const grid = [];
  for (let r = 0; r <= rows; r++) { grid[r] = []; for (let c = 0; c <= cols; c++) grid[r][c] = pt(c, r); }
  let html = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]];
    const cx = (c + .5) / cols - .5, cy = (r + .5) / rows - .5;
    html += `<i class="lb-piece" style="--clip:polygon(${p.map(q => `${q[0].toFixed(1)}% ${q[1].toFixed(1)}%`).join(',')});--dx:${Math.round(cx * 340 + lbRnd(-30, 30))}px;--dy:${Math.round(cy * 300 + lbRnd(40, 100))}px;--rot:${Math.round(lbRnd(-70, 70))}deg"><img src="${escHtml(img.src)}" alt=""></i>`;
  }
  lbFxAdd(fx, html);
}

function playLbBattle(res) {
  const box = document.getElementById('login-bonus-box');
  const modal = document.getElementById('login-bonus-modal');
  const arena = document.getElementById('lb-arena');
  const fx = document.getElementById('lb-fx');
  const heartsWrap = document.getElementById('lb-hearts-wrap');
  const judges = [...document.querySelectorAll('#lb-screen-result .lb-judge')];
  const verdict = document.getElementById('lb-verdict');
  const ptBox = document.getElementById('lb-pt-box');
  const ptNum = document.getElementById('lb-pt-num');
  const before = res.boss_hp_before, after = res.boss_hp_after;
  const damage = before != null && after != null ? before - after : 0;
  const total = res.total, mega = total === 2;
  const tier = LB_TIERS[String(total)];
  const element = res.picked_element, color = LB_ELEMENT_COLOR[element] || '#fff';
  fx.style.setProperty('--el', color);

  let done = false, wake = null;
  // 待っている間にタップされたら、すぐに最後の状態へ
  const wait = ms => new Promise(r => { if (done) return r(); const t0 = setTimeout(r, ms); wake = () => { clearTimeout(t0); r(); }; });

  function finish() {
    if (done) return;
    done = true;
    if (wake) wake();
    box.removeEventListener('click', onSkip);
    fx.innerHTML = '';
    modal.querySelectorAll('.lb-screen-flash').forEach(el => el.remove());
    box.classList.remove('lb-shake', 'lb-shake-big');
    arena.classList.remove('battle', 'hit', 'hit-big', 'guard', 'shattered');
    if (res.boss_defeated) arena.classList.add('defeated-still');
    judges.forEach(j => { j.classList.add('open'); j.classList.remove('pop'); });
    if (before != null) {
      heartsWrap.innerHTML = lbHeartsHTML(after, res.boss_max_hp) + (damage > 0 ? `<span class="lb-damage-note">${damage} ダメージ</span>` : '');
    }
    ptNum.textContent = res.points_earned;
    document.querySelectorAll('#lb-screen-result .lb-reveal').forEach(el => el.classList.add('on'));
    document.getElementById('lb-skip-hint')?.remove();
    renderLbDayTrack(res.streak, res.is_day7, true);
  }
  function onSkip(e) { if (!e.target.closest('#lb-close-btn')) finish(); }

  if (LB_REDUCE_MOTION) { finish(); return; }
  setTimeout(() => box.addEventListener('click', onSkip), 0);

  const flip = async j => {
    j.classList.add('open');
    await wait(170);
    if (!done) j.classList.add('pop');
  };

  (async () => {
    arena.classList.add('battle');
    await wait(380);
    if (done) return;
    await flip(judges[0]);
    await wait(200);
    if (done) return;
    await flip(judges[1]);
    await wait(220);
    if (done) return;

    // 溜め
    lbChargeFx(fx);
    await wait(mega ? 500 : 400);
    if (done) return;

    // 連撃（1発ごとに、斬撃 → 少し止めて着弾）
    const plan = lbHitPlan(total, damage);
    let hp = before;
    for (let i = 0; i < plan.length; i++) {
      const last = i === plan.length - 1, hit = plan[i];
      fx.innerHTML = '';
      lbStrikeFx(fx, res.picked_weapon, i, last, mega);
      await wait(last && mega ? 170 : 110);
      if (done) return;

      if (hit > 0) {
        lbImpactFx(fx, last && mega ? 26 : 13);
        lbElementFx(fx, element, last);
        lbFxAdd(fx, `<div class="lb-dmg${last && mega ? ' big' : ''}" style="--x:${last ? 0 : Math.round(lbRnd(-70, 70))}px;--y:${last ? 0 : Math.round(lbRnd(-6, 26))}px">${hit}</div>`);
        lbRestartClass(arena, last && mega ? 'hit-big' : 'hit');
        lbRestartClass(box, last && mega ? 'lb-shake-big' : 'lb-shake');
        if (last) lbScreenFlash(mega ? '#ffe7a0' : color, mega ? .46 : .24, mega ? 420 : 260);
        if (last && mega) lbFxAdd(fx, '<i class="lb-rays"></i><i class="lb-wash"></i>');
        if (hp != null) {
          hp -= hit;
          heartsWrap.innerHTML = lbHeartsHTML(hp, res.boss_max_hp);
          heartsWrap.firstElementChild?.classList.add('bump');
        }
      } else {
        // 弾かれる
        lbImpactFx(fx, 8);
        lbFxAdd(fx, '<div class="lb-dmg none">NO DAMAGE</div>');
        lbRestartClass(arena, 'guard');
        lbRestartClass(box, 'lb-shake');
      }
      await wait(last ? (mega ? 620 : 420) : 280);
      if (done) return;
    }

    // 結果の文字を叩きつける
    fx.innerHTML = `<div class="lb-tier-slam" style="--tc:${LB_SLAM_COLOR[total]};color:${mega ? '#ffe9a8' : '#fff'}">${tier.label}</div>`;
    if (total >= 1) lbRestartClass(box, 'lb-shake');
    await wait(650);
    if (done) return;

    if (res.boss_defeated) {
      fx.innerHTML = '';
      arena.classList.remove('hit', 'hit-big');
      lbScreenFlash('#fff', .5, 380);
      lbRestartClass(box, 'lb-shake-big');
      lbShatter(arena, fx);
      lbFxAdd(fx, '<i class="lb-rays"></i>');
      await wait(520);
      if (done) return;
      // 破片が飛んだあとは、暗くなった姿を残す
      arena.classList.remove('shattered');
      arena.classList.add('defeated-still');
      lbFxAdd(fx, '<div class="lb-defeat-stamp">DEFEATED</div>');
      await wait(820);
      if (done) return;
    }

    fx.innerHTML = '';
    arena.classList.remove('battle');
    verdict.classList.add('on');
    ptBox.classList.add('on');
    const t0 = performance.now(), D = 420;
    await new Promise(r => { (function tick(now) {
      if (done) return r();
      const k = Math.min(1, (now - t0) / D);
      ptNum.textContent = Math.round(res.points_earned * (1 - Math.pow(1 - k, 3)));
      k < 1 ? requestAnimationFrame(tick) : r();
    })(t0); });
    if (done) return;
    ptBox.classList.add('go');
    await wait(180);
    finish();
  })();
}

// ===== 特別ボーナス（期間限定。デイリーバトルとは別のポップアップ） =====
const _spToday = () => new Date().toISOString().slice(0, 10);
function spBonusCanClaim(b) {
  return b.claimed_count < b.max_claims && (!b.last_claimed_date || b.last_claimed_date.slice(0, 10) !== _spToday());
}
const SP_GIFT_SVG = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7.5h14V13M12 9v11.5"/><path d="M12 9C10.5 5.8 7 5.3 7 7.5S10 9 12 9zM12 9c1.5-3.2 5-3.7 5-1.5S14 9 12 9z"/></svg>`;

function spProgressHtml(b) {
  // 10回以下は丸の並び、それより多いと数字で
  if (b.max_claims <= 10) {
    return `<div class="sp-dots" aria-label="${b.claimed_count}/${b.max_claims}回受取">${Array.from({ length: b.max_claims }, (_, i) => `<i class="${i < b.claimed_count ? 'on' : ''}"></i>`).join('')}</div>`;
  }
  return `<div class="sp-count">${b.claimed_count}<span>/${b.max_claims}回</span></div>`;
}

function spItemHtml(b) {
  const can = spBonusCanClaim(b);
  const done = b.claimed_count >= b.max_claims;
  const label = can ? t('bonus.claim') : done ? t('bonus.limit') : t('bonus.received');
  const end = new Date(b.end_date);
  return `
    <div class="sp-item${can ? '' : ' is-claimed'}" data-id="${b.id}">
      <div class="sp-gift">${SP_GIFT_SVG}</div>
      <div class="sp-body">
        <div class="sp-title">${escHtml(b.title)}</div>
        <div class="sp-meta">${t('bonus.until', `${end.getMonth() + 1}/${end.getDate()}`)}</div>
        ${spProgressHtml(b)}
      </div>
      <div class="sp-reward">
        <div class="sp-pts">+${b.points_per_claim}<span>pt</span></div>
        <button type="button" class="sp-claim" ${can ? '' : 'disabled'} onclick="claimSpecialBonus(${b.id}, this)">${label}</button>
      </div>
      <div class="sp-stamp" aria-hidden="true">${t('bonus.received')}</div>
    </div>`;
}

function openSpecialBonusModal(bonuses) {
  if (!document.getElementById('sp-bonus-style')) {
    const style = document.createElement('style');
    style.id = 'sp-bonus-style';
    style.textContent = `
      #sp-bonus-modal { display:flex; position:fixed; inset:0; z-index:2000; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,0.72); }
      #sp-bonus-box {
        position:relative; width:100%; max-width:380px; max-height:88vh; overflow-y:auto; padding:30px 18px 18px; border-radius:16px; text-align:center;
        background:radial-gradient(120% 60% at 50% 0%, rgba(255,120,160,0.18), transparent 60%), linear-gradient(180deg, rgba(34,20,44,0.97), rgba(14,12,26,0.97));
        border:1px solid rgba(224,184,74,0.55); box-shadow:0 0 30px rgba(224,184,74,0.18), 0 16px 40px rgba(0,0,0,0.6);
        animation:spBoxIn 0.4s cubic-bezier(.2,.9,.3,1.25) both;
      }
      @keyframes spBoxIn { from { opacity:0; transform:translateY(12px) scale(0.94); } to { opacity:1; transform:none; } }
      .sp-ribbon {
        position:absolute; top:10px; left:50%; transform:translateX(-50%); padding:3px 18px; border-radius:3px;
        font-size:0.62rem; font-weight:900; letter-spacing:0.22em; color:#2a1a00; white-space:nowrap;
        background:linear-gradient(90deg, #c9a21c, #ffe38a, #c9a21c); box-shadow:0 2px 8px rgba(0,0,0,0.4);
      }
      #sp-bonus-box h3 { margin:14px 0 2px; font-size:1.2rem; letter-spacing:0.05em; color:#ffe38a; text-shadow:0 0 12px rgba(224,184,74,0.5); }
      .sp-sub { font-size:0.78rem; color:var(--text-secondary); margin-bottom:16px; }
      .sp-list { display:flex; flex-direction:column; gap:10px; text-align:left; }
      .sp-item {
        position:relative; display:flex; align-items:center; gap:12px; padding:12px; border-radius:12px; overflow:hidden;
        background:linear-gradient(100deg, rgba(255,120,160,0.12), rgba(224,184,74,0.08)); border:1px solid rgba(224,184,74,0.35);
      }
      /* チケットの切り込み */
      .sp-item::before, .sp-item::after { content:''; position:absolute; top:50%; width:14px; height:14px; margin-top:-7px; border-radius:50%; background:#15111f; border:1px solid rgba(224,184,74,0.35); }
      .sp-item::before { left:-8px; } .sp-item::after { right:-8px; }
      .sp-gift { flex-shrink:0; width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#ffe38a; background:rgba(224,184,74,0.14); border:1px solid rgba(224,184,74,0.4); }
      .sp-item:not(.is-claimed) .sp-gift { animation:spGiftBob 2.2s ease-in-out infinite; }
      @keyframes spGiftBob { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-3px) rotate(-4deg); } }
      .sp-body { flex:1; min-width:0; }
      .sp-title { font-size:0.9rem; font-weight:bold; color:var(--text-primary); line-height:1.35; word-break:break-word; }
      .sp-meta { font-size:0.7rem; color:var(--text-secondary); margin-top:2px; }
      .sp-dots { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
      .sp-dots i { width:9px; height:9px; border-radius:50%; background:rgba(255,255,255,0.12); border:1px solid rgba(224,184,74,0.35); }
      .sp-dots i.on { background:#e0b84a; box-shadow:0 0 6px rgba(224,184,74,0.7); border-color:#e0b84a; }
      .sp-count { margin-top:4px; font-size:0.85rem; font-weight:900; color:#e0b84a; font-variant-numeric:tabular-nums; }
      .sp-count span { font-size:0.7rem; font-weight:normal; color:var(--text-secondary); }
      .sp-reward { flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:6px; }
      .sp-pts { font-size:1.15rem; font-weight:900; color:#ffe38a; font-variant-numeric:tabular-nums; }
      .sp-pts span { font-size:0.7rem; margin-left:1px; opacity:0.8; }
      .sp-claim {
        padding:6px 14px; border:none; border-radius:99px; cursor:pointer; font-family:inherit; font-size:0.78rem; font-weight:800; color:#2a1a00;
        background:linear-gradient(180deg, #ffe38a, #d8a93a); box-shadow:0 3px 10px rgba(224,184,74,0.45); transition:transform 0.15s, box-shadow 0.15s;
      }
      .sp-claim:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 5px 14px rgba(224,184,74,0.6); }
      .sp-claim:disabled { cursor:default; background:rgba(255,255,255,0.1); color:var(--text-secondary); box-shadow:none; }
      .sp-item.is-claimed { border-color:rgba(255,255,255,0.14); background:rgba(255,255,255,0.03); }
      .sp-item.is-claimed .sp-gift, .sp-item.is-claimed .sp-pts { opacity:0.45; }
      .sp-stamp {
        position:absolute; right:78px; top:50%; padding:2px 10px; border:2px solid #ff5470; border-radius:6px; pointer-events:none;
        font-size:0.8rem; font-weight:900; letter-spacing:0.1em; color:#ff5470; opacity:0; transform:translateY(-50%) rotate(-12deg) scale(1.6);
      }
      .sp-item.stamped .sp-stamp { animation:spStamp 0.35s cubic-bezier(.3,1.6,.5,1) forwards; }
      @keyframes spStamp { to { opacity:0.85; transform:translateY(-50%) rotate(-12deg) scale(1); } }
      .sp-float { position:absolute; right:16px; top:8px; font-size:1rem; font-weight:900; color:#ffe38a; pointer-events:none; text-shadow:0 0 10px rgba(224,184,74,0.9); animation:spFloat 1s ease-out forwards; }
      @keyframes spFloat { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-26px); } }
      .sp-close { margin-top:16px; width:100%; justify-content:center; }
      @media (prefers-reduced-motion: reduce) {
        #sp-bonus-box, .sp-item:not(.is-claimed) .sp-gift, .sp-float { animation:none; }
        .sp-item.stamped .sp-stamp { animation:none; opacity:0.85; transform:translateY(-50%) rotate(-12deg); }
      }
    `;
    document.head.appendChild(style);
  }
  document.getElementById('sp-bonus-modal')?.remove();
  const visible = bonuses.filter(b => b.claimed_count < b.max_claims || spBonusCanClaim(b));
  const modal = document.createElement('div');
  modal.id = 'sp-bonus-modal';
  modal.innerHTML = `
    <div id="sp-bonus-box" role="dialog" aria-label="${t('bonus.special')}">
      <div class="sp-ribbon">SPECIAL BONUS</div>
      <h3>${t('bonus.special')}</h3>
      <div class="sp-sub">期間限定のボーナスを受け取ろう</div>
      <div class="sp-list">${visible.map(spItemHtml).join('')}</div>
      <button type="button" class="btn btn-secondary sp-close" id="sp-close-btn" onclick="closeSpecialBonusModal()">あとで</button>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) closeSpecialBonusModal(); });
  document.body.appendChild(modal);
  lockBodyScroll();
  updateSpCloseBtn();
}

function closeSpecialBonusModal() {
  const modal = document.getElementById('sp-bonus-modal');
  if (!modal) return;
  modal.remove();
  unlockBodyScroll();
}

// 全部受け取ったら「OK」に変える
function updateSpCloseBtn() {
  const btn = document.getElementById('sp-close-btn');
  if (!btn) return;
  const left = [...document.querySelectorAll('#sp-bonus-modal .sp-claim')].some(b => !b.disabled);
  btn.textContent = left ? 'あとで' : 'OK';
  btn.className = `btn ${left ? 'btn-secondary' : 'btn-primary'} sp-close`;
}

async function claimSpecialBonus(bonusId, btn) {
  btn.disabled = true;
  const item = btn.closest('.sp-item');
  try {
    const res = await apiFetch(`/auth/special-bonuses/${bonusId}/claim`, { method: 'POST' });
    btn.textContent = res.claimed_count >= res.max_claims ? t('bonus.limit') : t('bonus.received');
    item.classList.add('is-claimed', 'stamped');
    const dots = item.querySelectorAll('.sp-dots i');
    if (dots[res.claimed_count - 1]) dots[res.claimed_count - 1].classList.add('on');
    const count = item.querySelector('.sp-count');
    if (count) count.innerHTML = `${res.claimed_count}<span>/${res.max_claims}回</span>`;
    const float = document.createElement('div');
    float.className = 'sp-float';
    float.textContent = `+${res.points_earned}pt`;
    item.appendChild(float);
    setTimeout(() => float.remove(), 1100);
    updateSpCloseBtn();
  } catch (err) {
    btn.disabled = false;
    showMessage(err.message);
  }
}

// ===== ユーティリティ =====
function renderSubmissionPeriod(event) {
  if (!event.submission_start && !event.submission_end) return '';
  const fmt = s => new Date(s).toLocaleString(getLangLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const start = event.submission_start ? new Date(event.submission_start) : null;
  const end = event.submission_end ? new Date(event.submission_end) : null;
  let label = '';
  if (start && end) {
    const state = now < start ? (getLang() === 'zh' ? '（尚未開始）' : '（開始前）') : now > end ? (getLang() === 'zh' ? '（已截止）' : '（終了）') : '';
    label = (getLang() === 'zh' ? '投稿期間: ' : '投稿期間: ') + `${fmt(start)} 〜 ${fmt(end)}${state}`;
  } else if (end) {
    label = (getLang() === 'zh' ? '接受投稿：〜 ' : '投稿受付中: 〜 ') + fmt(end);
  } else if (start) {
    label = (getLang() === 'zh' ? '開始時間: ' : '投稿開始: ') + fmt(start);
  }
  return label ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">${escHtml(label)}</div>` : '';
}

// ===== Google連携バナー =====
async function checkGoogleLink() {
  if (!getToken()) return;
  if (localStorage.getItem('google_link_dismissed')) return;
  if (/Line\/|FBAN|FBAV|Instagram|MicroMessenger|WebView|wv\b|Twitter|TwitterAndroid/i.test(navigator.userAgent)) return;
  try {
    const me = await apiFetch('/auth/me').catch(() => null);
    if (!me || me.has_google) return;

    // Google SDK のクライアントID取得
    const { client_id } = await fetch('/api/auth/google/client-id').then(r => r.json()).catch(() => ({}));
    if (!client_id) return;

    // バナー挿入
    const banner = document.createElement('div');
    banner.id = 'google-link-banner';
    banner.style.cssText = 'position:sticky;top:56px;z-index:49;background:var(--bg-modal);border-bottom:1px solid rgba(255,77,101,0.45);color:#fff;font-size:0.82rem;padding:8px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    banner.innerHTML = `
      <span style="flex:1;min-width:180px">Googleアカウントと連携するとパスワード不要でログインできます</span>
      <div id="google-link-btn-wrap"></div>
      <button onclick="dismissGoogleLinkBanner()" style="background:none;border:none;color:#fff;font-size:1.1rem;cursor:pointer;padding:0 4px;line-height:1">×</button>
    `;
    document.querySelector('nav')?.insertAdjacentElement('afterend', banner);

    // Google SDKロード後にボタンレンダリング
    const initBtn = () => {
      if (!window.google) return;
      google.accounts.id.initialize({ client_id, callback: handleGoogleLinkCredential });
      google.accounts.id.renderButton(
        document.getElementById('google-link-btn-wrap'),
        { theme: 'filled_blue', size: 'small', text: 'signin_with', locale: 'ja' }
      );
    };
    if (!document.querySelector('script[src*="accounts.google.com"]')) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = initBtn;
      document.head.appendChild(s);
    } else if (window.google) {
      initBtn();
    } else {
      document.querySelector('script[src*="accounts.google.com"]')?.addEventListener('load', initBtn);
    }
  } catch {}
}

async function dismissGoogleLinkBanner() {
  if (!await showConfirm('このバナーを非表示にしますか？\n\nGoogle連携はアカウントページからいつでも行えます。', { okLabel: '非表示にする' })) return;
  document.getElementById('google-link-banner')?.remove();
  localStorage.setItem('google_link_dismissed', '1');
}

async function handleGoogleLinkCredential(response) {
  try {
    await apiFetch('/auth/google/link', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential })
    });
    const banner = document.getElementById('google-link-banner');
    if (banner) {
      banner.style.background = '#1b5e20';
      banner.innerHTML = '<span>✓ Googleアカウントを連携しました</span>';
      setTimeout(() => banner.remove(), 3000);
    }
    localStorage.setItem('google_link_dismissed', '1');
  } catch (err) {
    const banner = document.getElementById('google-link-banner');
    if (banner) {
      const msg = document.createElement('span');
      msg.style.color = '#ffcdd2';
      msg.textContent = err.message;
      banner.appendChild(msg);
    }
  }
}
