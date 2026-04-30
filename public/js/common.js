const API = '/api';

const ATTRIBUTES = ['火', '氷', '雷', '光', '闇', '無'];

// ===== 国際化 (i18n) =====
const _i18n = {
  ja: {
    'nav.events':'イベント一覧','nav.submit':'スコア投稿','nav.shop':'ショップ',
    'nav.equip':'装備','nav.gacha':'ガチャ','nav.feedback':'お便り箱','nav.my_videos':'動画管理','nav.charts':'チャート',
    'chart.my_charts':'マイチャート','chart.new':'+ 新規作成','chart.manage':'管理',
    'chart.board':'チャート掲示板','chart.all_events':'全イベント',
    'chart.search_code':'チャートID検索','chart.search_user':'ユーザー名検索',
    'chart.search':'検索','chart.reset':'リセット',
    'chart.no_charts':'チャートがありません',
    'chart.edit':'編集','chart.delete':'削除','chart.delete_confirm':'このチャートを削除しますか？',
    'nav.admin':'管理','nav.account':'アカウント','nav.logout':'ログアウト',
    'nav.login':'ログイン','nav.register':'登録','nav.register_full':'新規登録',
    'nav.admin_badge':'管理者','nav.menu':'メニュー',
    'loading':'読み込み中...','error':'エラーが発生しました','close':'閉じる',
    'save':'保存する','cancel':'キャンセル','send':'送信',
    'status.pending':'承認待ち','status.approved':'承認済み','status.rejected':'却下',
    'attr.火':'火','attr.氷':'氷','attr.雷':'雷','attr.光':'光','attr.闇':'闇','attr.無':'無',
    'event.before':'開催前','event.ended':'終了','event.active':'開催中',
    'event.hours_left':'あと{0}時間','event.days_left':'あと{0}日',
    'event.empty':'現在公開中のイベントはありません','event.back':'← イベント一覧',
    'index.title':'ヘブバン ランキングボード','index.subtitle':'制作:つんつく',
    'ranking.all_on':'全属性ON','ranking.all_off':'全属性OFF','ranking.submit_btn':'スコア投稿',
    'ranking.col_score':'スコア','ranking.col_title':'称号',
    'ranking.th_rank':'順位','ranking.th_attr':'属性','ranking.th_player':'プレイヤー',
    'ranking.th_score':'スコア','ranking.th_title':'称号',
    'ranking.empty':'選択した属性のスコアデータがありません',
    'ranking.enemies':'出現する敵','ranking.rules':'特殊ルール',
    'ranking.last_updated':'最終更新: ','ranking.anonymous':'匿名','ranking.weak':'弱点',
    'ranking.not_started':'このイベントはまだ投稿期間外です',
    'ranking.period_ended':'このイベントは投稿期間が終了しています',
    'submit.title':'スコア投稿','submit.subtitle':'リザルト画像とともにスコアを投稿してください',
    'submit.event':'イベント','submit.attr':'属性','submit.image':'リザルト画像',
    'submit.image_hint':'JPG・PNG・WebP対応 / 最大10MB','submit.score':'スコア',
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
    'login.title':'ログイン','login.username':'ユーザー名','login.password':'パスワード',
    'login.btn':'ログイン','login.btn_loading':'ログイン中...',
    'login.no_account':'アカウントがない方は','login.register_link':'新規登録',
    'login.expired':'セッションの有効期限が切れました。再度ログインしてください。',
    'register.title':'新規登録','register.username':'ユーザー名','register.password':'パスワード',
    'register.oshi':'推しキャラクター（任意）','register.username_hint':'1〜12文字',
    'register.password_hint':'6文字以上','register.oshi_ph':'例: 茅森月歌',
    'register.btn':'登録する','register.btn_loading':'登録中...',
    'register.has_account':'すでにアカウントがある方は','register.login_link':'ログイン',
    'feedback.title':'お便り箱','feedback.subtitle':'機能要望・バグ報告・その他ご意見をお送りください',
    'feedback.category':'カテゴリ','feedback.body':'内容',
    'feedback.cat_feature':'機能要望','feedback.cat_bug':'バグ報告','feedback.cat_other':'その他',
    'feedback.body_ph':'ご意見・ご要望をご記入ください（1000文字以内）',
    'feedback.char_limit':' / 1000文字','feedback.btn':'送信する','feedback.btn_loading':'送信中...',
    'feedback.disclaimer':'送信内容はユーザー名と共に管理者のみ確認できます',
    'feedback.history':'送信済みのお便り','feedback.empty':'まだ送信したお便りはありません',
    'feedback.err_empty':'内容を入力してください','feedback.admin':'管理者','feedback.you':'あなた',
    'feedback.has_reply':'返信あり','feedback.reply_btn':'返信する',
    'feedback.reply_ph':'返信を入力（1000文字以内）',
    'dist.title':'ポイント配布のお知らせ','dist.sub':'以下のイベントでポイントが配布されました',
    'dist.type_mid':'中間','dist.type_final':'最終','dist.detail_btn':'配布量詳細を見る',
    'dist.th_rank':'順位','dist.th_pts':'配布pt',
    'dist.rank1':'1位','dist.rank2':'2位','dist.rank3':'3位','dist.rank4':'4位','dist.rank5':'5位',
    'dist.rank6':'6位','dist.rank7':'7位','dist.rank8':'8位','dist.rank9':'9位','dist.rank10':'10位',
    'dist.rank11_15':'11〜15位','dist.rank16_20':'16〜20位','dist.rank21_25':'21〜25位',
    'dist.rank26_30':'26〜30位','dist.rank31plus':'31位以降',
    'dist.note':'※配布量はイベントごとに調整される場合があります',
    'bonus.title':'ログインボーナス','bonus.sub':'毎日ログインでポイント獲得！',
    'bonus.claim':'受け取る','bonus.day':'{0}日目','bonus.claimed':'本日分受取済み',
    'bonus.msg':'{0}日目のボーナス','bonus.streak':'{0}日目 達成！','bonus.streak7':' 🎉 7日達成！',
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
    'shop.title':'ショップ','shop.equip_title':'装備',
    'shop.my_points':'所持ポイント','shop.points_hint':'※ポイントはランキングに応じて配布されます',
    'shop.tab_titles':'称号','shop.tab_frames':'フレーム','shop.tab_icons':'アイコン',
    'shop.buy':'購入する','shop.equip_btn':'装備する','shop.unequip':'外す',
    'shop.owned':'所持済み','shop.equipped_badge':'装備中',
    'shop.no_titles':'購入できる称号がありません',
    'shop.no_frames':'購入できるフレームがありません',
    'shop.no_my_titles':'所持している称号がありません',
    'shop.no_my_frames':'所持しているフレームがありません',
    'shop.no_icons':'所持しているアイコンがありません',
    'shop.login_to_buy':'ログインして購入',
    'shop.title_award':'称号獲得',
    'shop.icon_none':'なし','shop.no_unit':'部隊なし',
    'shop.sort_unit':'部隊順','shop.sort_acq':'入手順',
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
    'gacha.no_icons':'まだアイコンを所持していません',
    'gacha.pool_modal_title':'排出対象アイコン',
    'gacha.back_pool':'← 選択に戻る',
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
    'filter.reset':'リセット','filter.apply_close':'適用して閉じる',
    'filter.event_type':'イベント種類',
    'filter.score_attack':'スコアアタック','filter.seraph':'セラフ遭遇戦演習',
    'filter.enemy_count':'敵数（スコアアタックのみ）',
    'filter.single':'単体','filter.multi':'複数',
    'filter.weak_attr':'弱点属性','filter.or':'いずれか','filter.and':'すべて含む',
    'filter.destruction_rate':'破壊率','filter.no_match':'条件に一致するイベントがありません',
    'doc.terms':'利用規約','doc.privacy':'プライバシーポリシー',
    'doc.copy_link':'リンクをコピー','doc.copy_done':'コピーしました！',
    'rate.title':'レートランキング','rate.subtitle':'X・Exランクユーザーのレート順',
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
    'nav.events':'活動列表','nav.submit':'上傳分數','nav.shop':'商店',
    'nav.equip':'裝備','nav.gacha':'轉蛋','nav.feedback':'意見箱','nav.my_videos':'影片管理','nav.charts':'攻略圖表',
    'chart.my_charts':'我的攻略圖表','chart.new':'+ 新建','chart.manage':'管理',
    'chart.board':'攻略圖表看板','chart.all_events':'全部活動',
    'chart.search_code':'搜尋圖表ID','chart.search_user':'搜尋用戶名',
    'chart.search':'搜尋','chart.reset':'重置',
    'chart.no_charts':'沒有攻略圖表',
    'chart.edit':'編輯','chart.delete':'刪除','chart.delete_confirm':'確定刪除此攻略圖表？',
    'nav.admin':'管理','nav.account':'帳戶','nav.logout':'登出',
    'nav.login':'登入','nav.register':'註冊','nav.register_full':'新增帳戶',
    'nav.admin_badge':'管理員','nav.menu':'選單',
    'loading':'載入中...','error':'發生錯誤','close':'關閉',
    'save':'儲存','cancel':'取消','send':'送出',
    'status.pending':'待審核','status.approved':'已核准','status.rejected':'已拒絕',
    'attr.火':'火','attr.氷':'氷','attr.雷':'雷','attr.光':'光','attr.闇':'闇','attr.無':'無',
    'event.before':'尚未開始','event.ended':'已結束','event.active':'進行中',
    'event.hours_left':'剩{0}小時','event.days_left':'剩{0}天',
    'event.empty':'目前沒有公開的活動','event.back':'← 活動列表',
    'index.title':'Heaven Burns Red 排行榜','index.subtitle':'製作：つんつく',
    'ranking.all_on':'全屬性ON','ranking.all_off':'全屬性OFF','ranking.submit_btn':'上傳分數',
    'ranking.col_score':'分數','ranking.col_title':'稱號',
    'ranking.th_rank':'排名','ranking.th_attr':'屬性','ranking.th_player':'玩家',
    'ranking.th_score':'分數','ranking.th_title':'稱號',
    'ranking.empty':'沒有所選屬性的分數資料',
    'ranking.enemies':'出現的敵人','ranking.rules':'特殊規則',
    'ranking.last_updated':'最後更新：','ranking.anonymous':'匿名','ranking.weak':'弱點',
    'ranking.not_started':'此活動尚未開放投稿',
    'ranking.period_ended':'此活動的投稿時間已截止',
    'submit.title':'上傳分數','submit.subtitle':'請附上結果截圖上傳分數',
    'submit.event':'活動','submit.attr':'屬性','submit.image':'結果截圖',
    'submit.image_hint':'支援 JPG・PNG・WebP / 最大 10MB','submit.score':'分數',
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
    'login.title':'登入','login.username':'使用者名稱','login.password':'密碼',
    'login.btn':'登入','login.btn_loading':'登入中...',
    'login.no_account':'沒有帳戶嗎？','login.register_link':'新增帳戶',
    'login.expired':'連線已逾時，請重新登入。',
    'register.title':'新增帳戶','register.username':'使用者名稱','register.password':'密碼',
    'register.oshi':'最愛角色（選填）','register.username_hint':'1～12個字元',
    'register.password_hint':'6個字元以上','register.oshi_ph':'例：茅森月歌',
    'register.btn':'註冊','register.btn_loading':'註冊中...',
    'register.has_account':'已有帳戶嗎？','register.login_link':'登入',
    'feedback.title':'意見箱','feedback.subtitle':'歡迎提供功能建議・錯誤回報・其他意見',
    'feedback.category':'類別','feedback.body':'內容',
    'feedback.cat_feature':'功能建議','feedback.cat_bug':'錯誤回報','feedback.cat_other':'其他',
    'feedback.body_ph':'請填寫您的意見・要求（1000字以內）',
    'feedback.char_limit':' / 1000字','feedback.btn':'送出','feedback.btn_loading':'送出中...',
    'feedback.disclaimer':'送出內容僅管理員可查閱，並附帶您的使用者名稱',
    'feedback.history':'已送出的意見','feedback.empty':'尚未送出任何意見',
    'feedback.err_empty':'請填寫內容','feedback.admin':'管理員','feedback.you':'你',
    'feedback.has_reply':'有回覆','feedback.reply_btn':'回覆',
    'feedback.reply_ph':'請輸入回覆（1000字以內）',
    'dist.title':'點數發放通知','dist.sub':'以下活動已發放點數',
    'dist.type_mid':'中間','dist.type_final':'最終','dist.detail_btn':'查看發放量詳情',
    'dist.th_rank':'排名','dist.th_pts':'發放pt',
    'dist.rank1':'第1名','dist.rank2':'第2名','dist.rank3':'第3名','dist.rank4':'第4名','dist.rank5':'第5名',
    'dist.rank6':'第6名','dist.rank7':'第7名','dist.rank8':'第8名','dist.rank9':'第9名','dist.rank10':'第10名',
    'dist.rank11_15':'第11〜15名','dist.rank16_20':'第16〜20名','dist.rank21_25':'第21〜25名',
    'dist.rank26_30':'第26〜30名','dist.rank31plus':'第31名以後',
    'dist.note':'※每次活動的發放量可能有所調整',
    'bonus.title':'登入獎勵','bonus.sub':'每日登入可獲得點數！',
    'bonus.claim':'領取','bonus.day':'第{0}天','bonus.claimed':'今日已領取',
    'bonus.msg':'第{0}天獎勵','bonus.streak':'第{0}天達成！','bonus.streak7':' 🎉 第7天達成！',
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
    'shop.title':'商店','shop.equip_title':'裝備',
    'shop.my_points':'擁有點數','shop.points_hint':'※點數依排名發放',
    'shop.tab_titles':'稱號','shop.tab_frames':'外框','shop.tab_icons':'圖示',
    'shop.buy':'購買','shop.equip_btn':'裝備','shop.unequip':'卸除',
    'shop.owned':'已擁有','shop.equipped_badge':'裝備中',
    'shop.no_titles':'沒有可購買的稱號',
    'shop.no_frames':'沒有可購買的外框',
    'shop.no_my_titles':'沒有擁有的稱號',
    'shop.no_my_frames':'沒有擁有的外框',
    'shop.no_icons':'沒有擁有的圖示',
    'shop.login_to_buy':'登入後購買',
    'shop.title_award':'稱號獲得',
    'shop.icon_none':'無','shop.no_unit':'無部隊',
    'shop.sort_unit':'部隊順','shop.sort_acq':'入手順',
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
    'gacha.no_icons':'尚未擁有任何圖示',
    'gacha.pool_modal_title':'收錄圖示',
    'gacha.back_pool':'← 返回選擇',
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
    'filter.reset':'重置','filter.apply_close':'套用並關閉',
    'filter.event_type':'活動類型',
    'filter.score_attack':'分數挑戰','filter.seraph':'熾天使遭遇戰演習',
    'filter.enemy_count':'敵人數量（僅限分數挑戰）',
    'filter.single':'單體','filter.multi':'複數',
    'filter.weak_attr':'弱點屬性','filter.or':'任一','filter.and':'全部包含',
    'filter.destruction_rate':'破壞率','filter.no_match':'沒有符合條件的活動',
    'doc.terms':'使用條款','doc.privacy':'隱私政策',
    'doc.copy_link':'複製連結','doc.copy_done':'已複製！',
    'rate.title':'評分排行榜','rate.subtitle':'X・Ex等級玩家評分排名',
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
        if (user && user.is_internal !== data.is_internal) {
          user.is_internal = data.is_internal;
          localStorage.setItem('user', JSON.stringify(user));
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
    location.href = '/login.html?expired=1';
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
  const data = await res.json();
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

function clearAlert(container) {
  const el = document.querySelector(container);
  if (el) el.innerHTML = '';
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
  gacha:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z"/></svg>`,
  charts:   `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="1"/><line x1="2" y1="6" x2="14" y2="6"/><line x1="2" y1="10" x2="14" y2="10"/><line x1="7" y1="2" x2="7" y2="14"/></svg>`,
  videos:   `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M6.5 7.5l3 1.5-3 1.5V7.5z" fill="currentColor" stroke="none"/></svg>`,
  shop:     `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h10l-1.5 7.5h-7z"/><path d="M6 5c0-1.1.9-2 2-2s2 .9 2 2"/></svg>`,
  equip:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L3 4.5v4C3 11.5 5.5 13.5 8 14c2.5-.5 5-2.5 5-5.5v-4L8 2z"/></svg>`,
  feedback: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="9" rx="1"/><path d="M2 5l6 4 6-4"/></svg>`,
  account:  `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>`,
  admin:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1"/></svg>`,
  logout:   `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3H3v10h3"/><path d="M10 5l3 3-3 3M13 8H7"/></svg>`,
  login:    `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h3v10h-3"/><path d="M6 11l-3-3 3-3M3 8h6"/></svg>`,
  register: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="5.5" r="2.5"/><path d="M2 13c0-2.8 2.2-5 5-5"/><path d="M12 9v4M10 11h4"/></svg>`,
};
function ni(key) {
  return NAV_ICONS[key] ? `<span style="display:inline-flex;align-items:center;gap:6px">${NAV_ICONS[key]}<span>` : '<span>';
}

// ===== ナビ =====
function renderNav() {
  const user = getUser();
  const nav = document.getElementById('nav');
  if (!nav) return;
  const currentPath = location.pathname;
  const lang = getLang();
  const langBtn = `<button onclick="setLang(getLang()==='ja'?'zh':'ja')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:0.75rem;cursor:pointer;color:var(--text-muted);margin-right:4px" title="言語 / Language">${lang === 'ja' ? '繁中' : 'JP'}</button>`;

  nav.innerHTML = `
    <div class="nav-inner">
      <a class="nav-logo" href="/index.html">HBR-RB</a>
      <div class="nav-links">
        <a href="/submit.html" class="${currentPath === '/submit.html' ? 'active' : ''}">${t('nav.submit')}</a>
        <span id="nav-gacha-desktop" style="display:contents"></span>
        ${user && user.role === 'admin' ? `<a href="/charts.html" class="${currentPath === '/charts.html' || currentPath.startsWith('/chart') ? 'active' : ''}">${t('nav.charts')}</a>` : ''}
        ${user ? `<a href="/my-videos.html" class="${currentPath === '/my-videos.html' ? 'active' : ''}">${t('nav.my_videos')}</a>` : ''}
        ${user ? `<a href="/shop.html" class="${currentPath === '/shop.html' && !location.search.includes('tab=equip') ? 'active' : ''}">${t('nav.shop')}</a>` : ''}
        ${user ? `<a href="/shop.html?tab=equip" class="${currentPath === '/shop.html' && location.search.includes('tab=equip') ? 'active' : ''}">${t('nav.equip')}</a>` : ''}
        ${user ? `<a href="/feedback.html" class="${currentPath === '/feedback.html' ? 'active' : ''}">${t('nav.feedback')}</a>` : ''}
        ${user && user.role === 'admin' ? `<a href="/admin_index.html" class="${currentPath.startsWith('/admin') ? 'active' : ''}">${t('nav.admin')}</a>` : ''}
      </div>
      <div class="nav-user">
        ${langBtn}
        ${user
          ? `<a href="/user.html?id=${user.id}" class="nav-username">${escHtml(user.username)}</a>
             ${user.role === 'admin' ? `<span class="nav-admin-badge">${t('nav.admin_badge')}</span>` : ''}
             <button class="btn btn-secondary btn-sm nav-desktop-only" onclick="logout()">${t('nav.logout')}</button>`
          : `<a href="/login.html" class="btn btn-secondary btn-sm">${t('nav.login')}</a>
             <a href="/register.html" class="btn btn-primary btn-sm">${t('nav.register')}</a>`
        }
      </div>
      <button class="nav-hamburger" id="nav-hamburger" onclick="toggleMobileNav()" aria-label="${t('nav.menu')}">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="nav-mobile" id="nav-mobile">
      <a href="/submit.html">${ni('submit')}${t('nav.submit')}</span></span></a>
      <span id="nav-gacha-mobile" style="display:contents"></span>
      ${user && user.role === 'admin' ? `<a href="/charts.html">${ni('charts')}${t('nav.charts')}</span></span></a>` : ''}
      ${user ? `<a href="/my-videos.html">${ni('videos')}${t('nav.my_videos')}</span></span></a>` : ''}
      ${user ? `<a href="/shop.html">${ni('shop')}${t('nav.shop')}</span></span></a>` : ''}
      ${user ? `<a href="/shop.html?tab=equip">${ni('equip')}${t('nav.equip')}</span></span></a>` : ''}
      ${user ? `<a href="/feedback.html">${ni('feedback')}${t('nav.feedback')}</span></span></a>` : ''}
      ${user
        ? `<a href="/user.html?id=${user.id}">${ni('account')}${t('nav.account')}</span></span></a>
           ${user.role === 'admin' ? `<a href="/admin_index.html">${ni('admin')}${t('nav.admin')}</span></span></a>` : ''}
           <a href="#" onclick="logout();return false;">${ni('logout')}${t('nav.logout')}</span></span></a>`
        : `<a href="/login.html">${ni('login')}${t('nav.login')}</span></span></a>
           <a href="/register.html">${ni('register')}${t('nav.register_full')}</span></span></a>`
      }
    </div>`;
  applyI18n();
}

function toggleMobileNav() {
  document.getElementById('nav-mobile')?.classList.toggle('open');
}

// renderNav後に自動でログインボーナスチェック＋ガチャナビ更新
const _origRenderNav = renderNav;
renderNav = function() {
  _origRenderNav();
  if (!document.getElementById('login-bonus-modal')) initLoginBonus();
  if (!document.getElementById('interim-dist-modal')) initInterimDistributionNotice();
  updateGachaNav();
  updateFeedbackBadge();
  checkGoogleLink();
  initAccountSettingsPrompt();
};

async function updateFeedbackBadge() {
  const user = getUser();
  if (!user) return;
  try {
    const data = await apiFetch('/feedback/unread-reply-count');
    if (!data.count) return;
    const badge = `<span style="display:inline-block;min-width:16px;height:16px;line-height:16px;font-size:0.65rem;font-weight:bold;background:#ef5350;color:#fff;border-radius:8px;text-align:center;padding:0 4px;margin-left:4px;vertical-align:middle">${data.count}</span>`;
    document.querySelectorAll('a[href="/feedback.html"]').forEach(a => {
      a.innerHTML = t('nav.feedback') + badge;
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
    const linkHtml = `<a href="/gacha.html"${isActive ? ' class="active"' : ''}>${t('nav.gacha')}</a>`;
    const d = document.getElementById('nav-gacha-desktop');
    const m = document.getElementById('nav-gacha-mobile');
    if (d) d.innerHTML = linkHtml;
    if (m) m.innerHTML = linkHtml;
  } catch {}
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
async function initInterimDistributionNotice() {
  if (!getToken()) return;
  if (window._distNoticeStarted) return;
  if (window._rankUpdatePromise) {
    await Promise.race([window._rankUpdatePromise, new Promise(r => setTimeout(r, 3000))]);
  }
  const rankModal = document.getElementById('rank-update-modal');
  if (rankModal && rankModal.style.display === 'flex') {
    window._pendingDistNotice = true;
    return;
  }
  window._distNoticeStarted = true;
  try {
    const meData = await apiFetch('/auth/me').catch(() => null);
    const isInternalUser = !!(meData && meData.is_internal);
    const [interim, final, rankPts, extRankPts] = await Promise.all([
      apiFetch('/events/interim-distributions/recent').catch(() => []),
      apiFetch('/events/final-distributions/recent').catch(() => []),
      isInternalUser ? apiFetch('/events/rank-pts').catch(() => null) : Promise.resolve(null),
      apiFetch('/events/ext-rank-pts').catch(() => null),
    ]);
    const seenAt = localStorage.getItem('interim_dist_seen_at');
    const isNew = d => !seenAt || new Date(d.distributed_at) > new Date(seenAt);
    // 外部ユーザーは外部配布のみ表示
    const scopeFilter = d => isInternalUser || d.type === 'external';
    const unseenInterim = (interim || []).filter(isNew).filter(d => d.user_rank != null).filter(scopeFilter).map(d => ({ ...d, scope: d.type, period: t('dist.type_mid') }));
    const unseenFinal  = (final  || []).filter(isNew).filter(d => d.user_rank != null).filter(scopeFilter).map(d => ({ ...d, scope: d.type, period: t('dist.type_final') }));
    const unseen = [...unseenFinal, ...unseenInterim]
      .sort((a, b) => new Date(b.distributed_at) - new Date(a.distributed_at));
    if (unseen.length === 0) return;

    const hasInternal = isInternalUser && unseen.some(d => d.scope === 'internal');
    const hasExternal = unseen.some(d => d.scope === 'external');

    const style = document.createElement('style');
    style.textContent = `
      #interim-dist-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2100; align-items:center; justify-content:center; }
      #interim-dist-modal.open { display:flex; }
      #interim-dist-box { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:28px 24px; max-width:360px; width:90%; text-align:center; max-height:90vh; overflow-y:auto; }
      #interim-dist-box h3 { margin:0 0 6px; font-size:1.1rem; }
      #interim-dist-box .interim-sub { font-size:0.82rem; color:var(--text-muted); margin-bottom:18px; }
      .interim-dist-item { background:var(--bg-primary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; text-align:left; }
      .interim-dist-name { font-size:0.88rem; font-weight:bold; margin-bottom:2px; }
      .interim-dist-rank { font-size:1.1rem; font-weight:bold; color:var(--accent); margin:4px 0 2px; }
      .interim-dist-meta { font-size:0.72rem; color:var(--text-muted); }
      .interim-type-badge { font-size:0.7rem; padding:1px 6px; border-radius:4px; margin-left:6px; background:var(--accent-dim); color:var(--accent); }
      .rank-pts-table { width:100%; border-collapse:collapse; font-size:0.78rem; margin-top:8px; }
      .rank-pts-table th, .rank-pts-table td { padding:4px 8px; border:1px solid var(--border); text-align:center; }
      .rank-pts-table th { background:var(--bg-primary); color:var(--text-muted); }
      .rank-pts-note { font-size:0.72rem; color:var(--text-muted); margin-top:6px; }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'interim-dist-modal';
    modal.innerHTML = `
      <div id="interim-dist-box">
        <h3>${t('dist.title')}</h3>
        <div class="interim-sub">${t('dist.sub')}</div>
        <div id="interim-dist-list">${unseen.map(d => `
          <div class="interim-dist-item">
            <div class="interim-dist-name">
              ${escHtml(d.event_name)}
              <span class="interim-type-badge">${isInternalUser ? (d.scope === 'internal' ? '内部' : '外部') : ''}${d.period}配布</span>
            </div>
            <div class="interim-dist-rank">${d.user_rank}位　<span style="font-size:0.9rem">+${d.user_pts}pt</span></div>
            ${d.awarded_titles?.length ? `<div style="margin-top:4px;font-size:0.78rem;color:var(--accent)">🏆 称号獲得: ${d.awarded_titles.map(n => `「${escHtml(n)}」`).join(' ')}</div>` : ''}
            <div class="interim-dist-meta">${new Date(d.distributed_at).toLocaleString(getLangLocale())}</div>
          </div>`).join('')}
        </div>
        ${hasInternal && rankPts ? `
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;width:100%" onclick="document.getElementById('rank-pts-detail-int').style.display=document.getElementById('rank-pts-detail-int').style.display==='none'?'block':'none'">内部配布量詳細</button>
        <div id="rank-pts-detail-int" style="display:none;margin-top:8px">
          <table class="rank-pts-table">
            <tr><th>${t('dist.th_rank')}</th><th>${t('dist.th_pts')}</th></tr>
            <tr><td>${t('dist.rank1')}</td><td>${rankPts.rank_pts_1 ?? 100}pt</td></tr>
            <tr><td>${t('dist.rank2')}</td><td>${rankPts.rank_pts_2 ?? 95}pt</td></tr>
            <tr><td>${t('dist.rank3')}</td><td>${rankPts.rank_pts_3 ?? 95}pt</td></tr>
            <tr><td>${t('dist.rank4')}</td><td>${rankPts.rank_pts_4 ?? 90}pt</td></tr>
            <tr><td>${t('dist.rank5')}</td><td>${rankPts.rank_pts_5 ?? 90}pt</td></tr>
            <tr><td>${t('dist.rank6')}</td><td>${rankPts.rank_pts_6 ?? 80}pt</td></tr>
            <tr><td>${t('dist.rank7')}</td><td>${rankPts.rank_pts_7 ?? 80}pt</td></tr>
            <tr><td>${t('dist.rank8')}</td><td>${rankPts.rank_pts_8 ?? 80}pt</td></tr>
            <tr><td>${t('dist.rank9')}</td><td>${rankPts.rank_pts_9 ?? 80}pt</td></tr>
            <tr><td>${t('dist.rank10')}</td><td>${rankPts.rank_pts_10 ?? 80}pt</td></tr>
            <tr><td>${t('dist.rank11_15')}</td><td>${rankPts.rank_pts_11_15 ?? 60}pt</td></tr>
            <tr><td>${t('dist.rank16_20')}</td><td>${rankPts.rank_pts_16_20 ?? 50}pt</td></tr>
            <tr><td>${t('dist.rank21_25')}</td><td>${rankPts.rank_pts_21_25 ?? 30}pt</td></tr>
            <tr><td>${t('dist.rank26_30')}</td><td>${rankPts.rank_pts_26_30 ?? 20}pt</td></tr>
            <tr><td>${t('dist.rank31plus')}</td><td>${rankPts.rank_pts_31plus ?? 10}pt</td></tr>
          </table>
          <div class="rank-pts-note">${t('dist.note')}</div>
        </div>` : ''}
        ${hasExternal && extRankPts ? `
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;width:100%" onclick="document.getElementById('rank-pts-detail-ext').style.display=document.getElementById('rank-pts-detail-ext').style.display==='none'?'block':'none'">${isInternalUser ? '外部配布量詳細' : t('dist.detail_btn')}</button>
        <div id="rank-pts-detail-ext" style="display:none;margin-top:8px">
          <table class="rank-pts-table">
            <tr><th>${t('dist.th_rank')}</th><th>${t('dist.th_pts')}</th></tr>
            <tr><td>1〜5位</td><td>${extRankPts.ext_rank_pts_1_5 ?? 100}pt</td></tr>
            <tr><td>6〜10位</td><td>${extRankPts.ext_rank_pts_6_10 ?? 80}pt</td></tr>
            <tr><td>11〜20位</td><td>${extRankPts.ext_rank_pts_11_20 ?? 60}pt</td></tr>
            <tr><td>21〜30位</td><td>${extRankPts.ext_rank_pts_21_30 ?? 40}pt</td></tr>
            <tr><td>31〜50位</td><td>${extRankPts.ext_rank_pts_31_50 ?? 20}pt</td></tr>
            <tr><td>51〜100位</td><td>${extRankPts.ext_rank_pts_51_100 ?? 10}pt</td></tr>
            <tr><td>101位以降</td><td>${extRankPts.ext_rank_pts_101plus ?? 5}pt</td></tr>
          </table>
          <div class="rank-pts-note">${t('dist.note')}</div>
        </div>` : ''}
        <button class="btn btn-primary" style="margin-top:12px" onclick="closeInterimDistModal()">${t('close')}</button>
      </div>`;
    document.body.appendChild(modal);
    modal.classList.add('open');
  } catch {}
}

function closeInterimDistModal() {
  localStorage.setItem('interim_dist_seen_at', new Date().toISOString());
  document.getElementById('interim-dist-modal')?.classList.remove('open');
  const lbModal = document.getElementById('login-bonus-modal');
  if (lbModal && lbModal.classList.contains('open')) {
    lbModal.style.zIndex = '2100';
  }
}

// ===== アカウント設定促進モーダル =====
async function initAccountSettingsPrompt() {
  if (!getToken()) return;
  const seenAt = localStorage.getItem('account_prompt_seen');
  if (seenAt && Date.now() - new Date(seenAt).getTime() < 7 * 24 * 60 * 60 * 1000) return;

  if (window._rankUpdatePromise) {
    await Promise.race([window._rankUpdatePromise, new Promise(r => setTimeout(r, 3000))]);
  }
  await new Promise(r => setTimeout(r, 600));

  const rankModal = document.getElementById('rank-update-modal');
  const distModal = document.getElementById('interim-dist-modal');
  if ((rankModal && rankModal.style.display === 'flex') ||
      (distModal && distModal.classList.contains('open'))) return;

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
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:28px 24px;max-width:340px;width:90%;text-align:center">
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

    window.closeAccountPrompt = function() {
      localStorage.setItem('account_prompt_seen', new Date().toISOString());
      document.getElementById('account-settings-prompt')?.remove();
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

// ===== ログインボーナス =====
async function initLoginBonus() {
  if (!getToken()) return;

  const style = document.createElement('style');
  style.textContent = `
    #login-bonus-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2000; align-items:center; justify-content:center; }
    #login-bonus-modal.open { display:flex; }
    #login-bonus-box { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:28px 24px; max-width:360px; width:90%; text-align:center; max-height:90vh; overflow-y:auto; }
    #login-bonus-box h3 { margin:0 0 6px; font-size:1.1rem; }
    #login-bonus-box .bonus-sub { font-size:0.82rem; color:var(--text-muted); margin-bottom:18px; }
    .bonus-days { display:flex; gap:6px; justify-content:center; margin-bottom:20px; flex-wrap:wrap; }
    .bonus-day { width:38px; height:48px; border-radius:8px; border:1px solid var(--border); background:var(--bg-primary); display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:0.7rem; color:var(--text-muted); gap:2px; }
    .bonus-day.done { background:var(--accent-dim); border-color:var(--accent); color:var(--accent); }
    .bonus-day.today { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:bold; }
    .bonus-day .day-pt { font-size:0.78rem; font-weight:bold; }
    #login-bonus-pts { font-size:2rem; font-weight:bold; color:var(--accent); margin-bottom:6px; }
    #login-bonus-msg { font-size:0.85rem; color:var(--text-muted); margin-bottom:18px; }
    .special-bonus-list { margin-top:18px; border-top:1px solid var(--border); padding-top:14px; text-align:left; }
    .special-bonus-list h4 { font-size:0.85rem; color:var(--text-muted); margin:0 0 10px; text-align:center; }
    .special-bonus-item { background:var(--bg-primary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .special-bonus-info { flex:1; min-width:0; }
    .special-bonus-title { font-size:0.88rem; font-weight:bold; margin-bottom:2px; }
    .special-bonus-meta { font-size:0.72rem; color:var(--text-muted); }
    .special-bonus-btn { flex-shrink:0; }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'login-bonus-modal';
  modal.innerHTML = `
    <div id="login-bonus-box">
      <h3>${t('bonus.title')}</h3>
      <div class="bonus-sub">${t('bonus.sub')}</div>
      <div class="bonus-days" id="bonus-days"></div>
      <div id="login-bonus-pts"></div>
      <div id="login-bonus-msg"></div>
      <button class="btn btn-primary" id="bonus-claim-btn" onclick="claimLoginBonus()">${t('bonus.claim')}</button>
      <div id="special-bonus-section"></div>
    </div>`;
  document.body.appendChild(modal);

  try {
    const [status, specials] = await Promise.all([
      apiFetch('/auth/login-bonus'),
      apiFetch('/auth/special-bonuses').catch(() => [])
    ]);

    const hasUnclaimed = specials.some(b => b.claimed_count < b.max_claims && b.last_claimed_date !== new Date().toISOString().slice(0, 10));

    if (status.already_claimed && !hasUnclaimed) return;

    if (!status.already_claimed) {
      renderBonusDays(status.streak + 1, status.day_pts || [1,1,1,1,1,1,4]);
    } else {
      document.getElementById('bonus-claim-btn').style.display = 'none';
      document.getElementById('login-bonus-pts').textContent = t('bonus.claimed');
    }

    if (specials.length > 0) renderSpecialBonuses(specials);
    document.getElementById('login-bonus-modal').classList.add('open');
  } catch {}
}

function renderBonusDays(todayDay, pts) {
  const daysEl = document.getElementById('bonus-days');
  daysEl.innerHTML = pts.map((p, i) => {
    const day = i + 1;
    const done = day < todayDay;
    const isToday = day === todayDay;
    return `<div class="bonus-day ${done ? 'done' : isToday ? 'today' : ''}">
      <span>${t('bonus.day', day)}</span>
      <span class="day-pt">${p}pt</span>
    </div>`;
  }).join('');
  const todayPt = pts[Math.min(todayDay, 7) - 1];
  document.getElementById('login-bonus-pts').textContent = `+${todayPt}pt`;
  document.getElementById('login-bonus-msg').textContent = t('bonus.msg', todayDay);
}

function renderSpecialBonuses(bonuses) {
  const today = new Date().toISOString().slice(0, 10);
  const el = document.getElementById('special-bonus-section');
  const items = bonuses.filter(b => b.max_claims - b.claimed_count > 0).map(b => {
    const remaining = b.max_claims - b.claimed_count;
    const claimedToday = b.last_claimed_date && b.last_claimed_date.slice(0, 10) === today;
    const canClaim = remaining > 0 && !claimedToday;
    return `<div class="special-bonus-item">
      <div class="special-bonus-info">
        <div class="special-bonus-title">${escHtml(b.title)}</div>
        <div class="special-bonus-meta">${t('bonus.until', escHtml(b.end_date.slice(0,10)))} ・ ${b.points_per_claim}pt ・ ${t('bonus.remaining', remaining)}</div>
      </div>
      <button class="btn btn-primary btn-sm special-bonus-btn" ${canClaim ? '' : 'disabled'}
        onclick="claimSpecialBonus(${b.id}, this)">
        ${claimedToday ? t('bonus.received') : remaining <= 0 ? t('bonus.limit') : t('bonus.claim')}
      </button>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="special-bonus-list"><h4>${t('bonus.special')}</h4>${items}</div>`;
}

function checkAndCloseModal() {
  const loginBtn = document.getElementById('bonus-claim-btn');
  const closedText = t('close');
  const loginDone = !loginBtn || loginBtn.style.display === 'none' || loginBtn.disabled || loginBtn.textContent === closedText;
  const anySpecialLeft = [...document.querySelectorAll('.special-bonus-btn')].some(b => !b.disabled);
  if (loginDone && !anySpecialLeft) {
    setTimeout(() => document.getElementById('login-bonus-modal')?.classList.remove('open'), 800);
  }
}

async function claimSpecialBonus(bonusId, btn) {
  btn.disabled = true;
  try {
    const res = await apiFetch(`/auth/special-bonuses/${bonusId}/claim`, { method: 'POST' });
    btn.textContent = t('bonus.received');
    const meta = btn.closest('.special-bonus-item').querySelector('.special-bonus-meta');
    const remaining = res.max_claims - res.claimed_count;
    if (meta) {
      const lang = getLang();
      const pattern = lang === 'zh' ? /剩餘\d+次/ : /残り\d+回/;
      meta.textContent = meta.textContent.replace(pattern, t('bonus.remaining', remaining));
    }
    checkAndCloseModal();
  } catch (err) {
    btn.disabled = false;
    alert(err.message);
  }
}

async function claimLoginBonus() {
  const btn = document.getElementById('bonus-claim-btn');
  btn.disabled = true;
  try {
    const res = await apiFetch('/auth/login-bonus', { method: 'POST' });
    document.getElementById('login-bonus-pts').textContent = `+${res.points_earned}pt`;
    document.getElementById('login-bonus-msg').textContent = t('bonus.streak', res.streak) + (res.streak === 7 ? t('bonus.streak7') : '');
    btn.textContent = t('close');
    btn.onclick = () => document.getElementById('login-bonus-modal').classList.remove('open');
    btn.disabled = false;
    checkAndCloseModal();
  } catch (err) {
    btn.disabled = false;
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
  if (/Line\/|FBAN|FBAV|Instagram|MicroMessenger|WebView|wv\b/i.test(navigator.userAgent)) return;
  try {
    const me = await apiFetch('/auth/me').catch(() => null);
    if (!me || me.has_google) return;

    // Google SDK のクライアントID取得
    const { client_id } = await fetch('/api/auth/google/client-id').then(r => r.json()).catch(() => ({}));
    if (!client_id) return;

    // バナー挿入
    const banner = document.createElement('div');
    banner.id = 'google-link-banner';
    banner.style.cssText = 'position:sticky;top:56px;z-index:49;background:#1a237e;color:#fff;font-size:0.82rem;padding:8px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
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

function dismissGoogleLinkBanner() {
  if (!confirm('このバナーを非表示にしますか？\n\nGoogle連携はアカウントページからいつでも行えます。')) return;
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
