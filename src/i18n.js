// Dua bahasa: Indonesia (id) & Inggris (en). Pakai tr('kunci', {var}) di kode, data-i18n="kunci" di HTML.
const D = {
  id: {
    'menu.sub': 'Nikmati permainan Remi tradisional yang mustahil!',
    'menu.room': 'ROOM (TARGET SKOR)', 'menu.level': 'LEVEL BOT',
    'menu.play': '▶ MAIN', 'menu.help': '❓ CARA MAIN',
    'prof.title': '👤 Profil Pemain', 'prof.name': 'NAMA', 'prof.namePh': 'Masukkan nama...',
    'prof.avatar': 'PILIH AVATAR', 'prof.upload': '📷 Unggah Foto', 'prof.start': '▶ Mulai Bermain', 'prof.back': '← Kembali',
    'prof.defaultName': 'Pemain',
    'ph.draw': 'Tarik / Makan', 'ph.discard': 'Buang 1 kartu', 'ph.pluck': 'Cabut kartu', 'ph.deal': 'Membagi', 'ph.over': 'Ronde selesai', 'ph.wait': 'Memproses', 'ph.init': '',
    'hud.remi': 'REMI ✓',
    'help.btn': 'Cara Main', 'size.btn': 'Ukuran kartu (S / M / L)', 'log.title': '📜 Log Aksi', 'log.btn': 'Log aksi', 'lang.btn': 'Bahasa',
    'btn.meldMode': '🎴 Susun Seri', 'btn.meldCancel': '✖ Batal Seri', 'btn.doMeld': '✅ SERIKAN', 'btn.cancel': 'Batal', 'btn.close': '🔒 TUTUP (CLOSED)',
    'rotate.msg': 'Putar perangkat Anda ke mode landscape untuk bermain',
    'meld.title': '🎴 Konfirmasi Seri (Meld)', 'meld.yes': 'Jadikan Seri (+Poin)', 'meld.no': 'Simpan di Tangan',
    'meld.drawn': 'Kartu {card} dari tumpukan bisa membentuk Seri! Apakah Anda ingin menjadikannya seri sekarang?',
    'meld.more': 'Kartu di tangan Anda masih memiliki kombinasi Seri tambahan. Apakah Anda ingin menjadikannya Seri sekarang?',
    'msg.shuffling': 'Mengocok kartu...', 'msg.dealing': 'Membagikan kartu...',
    'msg.yourTurn': 'Giliran Anda: klik tumpukan untuk tarik, atau pilih kartu pendamping di tangan: kartu pool yang bisa dimakan akan menyala.',
    'msg.thinking': '{name} berpikir...', 'msg.choosing': '{name} memilih kartu...',
    'msg.deckEndMeld': 'Tumpukan habis dan sudah ada seri di meja. Ronde selesai!',
    'msg.deckEndNone': 'Tumpukan habis lagi dan tetap belum ada seri. Ronde selesai!',
    'msg.reshuffle': 'Belum ada seri! Tumpukan habis, pool dikocok ulang (kesempatan terakhir)...',
    'msg.discard': 'Buang 1 kartu ke pool (klik kartu).', 'msg.discardClose': ' Atau tutup ronde dengan tombol TUTUP.',
    'msg.pluck': 'Kartu lebih dari 7: Wajib mencabut 1 kartu tertutup (ditaruh di tempat denda).',
    'msg.roundOver': 'Ronde selesai! Membuka kartu semua pemain...',
    'msg.eatHint': 'Kartu pool yang menyala bisa dimakan: klik untuk makan.', 'msg.orMeld': ' Atau tekan SERIKAN untuk menurunkan seri.',
    'msg.meldOk': 'Kombinasi valid! Klik tombol SERIKAN untuk menurunkan seri.',
    'msg.selCount': 'Terpilih {n} kartu. Pilih 2 pendamping berurutan untuk makan pool, atau 3+ kartu untuk seri.',
    'msg.idleDraw': 'Klik tumpukan untuk tarik, atau pilih kartu pendamping di tangan.',
    'msg.meldDoneDiscard': 'Seri turun! Buang 1 kartu ke pool.', 'msg.meldDoneDraw': 'Seri turun! Klik tumpukan untuk tarik, atau pilih pendamping untuk makan.',
    'msg.pickFirst': 'Pilih dulu kartu pendamping di tangan; kartu pool yang bisa dimakan akan menyala.',
    'msg.max7': 'Maksimal 7 kartu dari atas pool.',
    'msg.noMatch': 'Kartu pool ini tidak cocok dengan pendamping yang Anda pilih (harus berurutan di satu sisi).',
    'msg.aceNo': 'As tidak boleh dibuang sebelum punya seri jadi.', 'msg.cancelSel': 'Pilihan kartu dibatalkan.',
    'msg.meldMode': 'Mode Susun Seri: klik kartu di tangan yang ingin diserikan (minimal 3).',
    'msg.remiWait': '{name} REMI! Pemain lain melanjutkan sampai ronde berakhir.',
    'log.meld': 'menurunkan seri {cards} (+{v})', 'log.round': '— Ronde {n} · Room {room} · mulai: {name} —',
    'log.drawBot': 'menarik 1 kartu dari tumpukan', 'log.drawYou': 'menarik {card} dari tumpukan',
    'log.eat': 'makan {k} kartu dari pool ({cards})', 'log.discard': 'membuang {card}',
    'log.closed': 'menutup ronde (CLOSED) dengan 1 kartu tertutup', 'log.pluck': 'mencabut 1 kartu tertutup (denda)',
    'log.deckEndMeld': 'Tumpukan habis & sudah ada seri → ronde selesai',
    'log.deckEndNone': 'Tumpukan habis lagi setelah kocok ulang & tetap tanpa seri → ronde selesai',
    'log.reshuffle': 'Belum ada seri di meja → pool dikocok ulang jadi tumpukan (kesempatan terakhir)',
    'log.closedBy': '{name} menutup ronde', 'log.noWinner': 'Ronde selesai', 'log.win': '🏆 {name} mencapai {score} dan menang!',
    'log.remi': 'REMI! Semua kartu jadi seri (+25). Selesai ronde untuk pemain ini.',
    'banner.yourTurn': 'Giliran Anda', 'banner.turnOf': 'Giliran {name}', 'banner.remi': 'REMI! {name}',
    'score.title': 'Ronde Selesai', 'score.closed': 'CLOSED oleh {name}', 'score.remiList': 'REMI: {names}',
    'score.player': 'Pemain', 'score.meld': 'Seri', 'score.minus': 'Minus', 'score.round': 'Ronde', 'score.total': 'Total',
    'score.win': '🏆 {name} MENANG DENGAN SKOR {score}!', 'score.again': 'Main Lagi (Pilih Room)',
    'score.tie': '⚖️ Skor puncak sama ({score}). Lanjut ronde berikutnya sampai ada yang unggul.', 'score.next': 'Ronde Berikutnya',
    'menu.online': '🌐 ONLINE', 'online.leave': 'Keluar dari game',
    'auth.title.login': '🔐 Masuk', 'auth.title.register': '📝 Daftar Akun', 'auth.email': 'EMAIL', 'auth.password': 'KATA SANDI', 'auth.name': 'NAMA TAMPILAN',
    'auth.login': 'Masuk', 'auth.register': 'Daftar', 'auth.toRegister': 'Belum punya akun? Daftar', 'auth.toLogin': 'Sudah punya akun? Masuk', 'auth.forgot': 'Lupa kata sandi?',
    'auth.forgotSent': 'Tautan reset kata sandi telah dikirim ke email Anda.', 'auth.confirmSent': 'Pendaftaran berhasil! Cek email Anda untuk konfirmasi, lalu masuk.',
    'auth.back': '← Kembali', 'auth.logout': 'Keluar akun', 'auth.enterEmail': 'Isi email Anda dulu.', 'auth.busy': 'Memproses...',
    'auth.err.invalid_credentials': 'Email atau kata sandi salah.', 'auth.err.email_not_confirmed': 'Email belum dikonfirmasi. Cek kotak masuk Anda.',
    'auth.err.user_already_exists': 'Email sudah terdaftar.', 'auth.err.weak_password': 'Kata sandi terlalu lemah (minimal 8 karakter).',
    'auth.err.rate': 'Terlalu banyak percobaan. Coba lagi nanti.', 'auth.err.email': 'Masukkan email yang valid.', 'auth.err.network': 'Tidak dapat terhubung ke server.', 'auth.err.generic': 'Terjadi kesalahan. Coba lagi.',
    'lobby.title': '🌐 Lobi Online', 'lobby.hello': 'Halo, {name}!', 'lobby.chips': '🪙 {n} chip', 'lobby.quick': 'CARI LAWAN OTOMATIS', 'lobby.room': 'ROOM', 'lobby.level': 'LEVEL BOT (pengisi kursi kosong)',
    'lobby.find': '🔎 Cari Lawan', 'lobby.create': 'RUANG PRIBADI', 'lobby.password': 'Sandi ruang (opsional)', 'lobby.createBtn': 'Buat Ruang', 'lobby.join': 'MASUK DENGAN KODE', 'lobby.code': 'Kode ruang',
    'lobby.joinBtn': 'Masuk', 'lobby.profile': 'PROFIL', 'lobby.save': 'Simpan', 'lobby.saved': 'Tersimpan.', 'lobby.back': '← Menu', 'lobby.resume': '▶ Lanjutkan game ({code})',
    'lobby.err.wrong_password': 'Sandi ruang salah.', 'lobby.err.room_not_found': 'Ruang tidak ditemukan.', 'lobby.err.room_full': 'Ruang sudah penuh.', 'lobby.err.room_started': 'Game di ruang ini sudah dimulai.',
    'lobby.err.already_in_room': 'Anda masih berada di ruang lain.', 'lobby.err.too_many_requests': 'Terlalu banyak percobaan. Tunggu sebentar.', 'lobby.err.unauthorized': 'Sesi habis. Silakan masuk lagi.',
    'lobby.err.busy': 'Server sibuk, coba lagi.', 'lobby.err.network': 'Tidak dapat terhubung ke server.', 'lobby.err.generic': 'Terjadi kesalahan. Coba lagi.', 'lobby.err.bad_password': 'Sandi ruang 4-32 karakter.',
    'room.title': 'Ruang {code}', 'room.share': 'Bagikan kode ini ke teman Anda', 'room.copy': '📋 Salin', 'room.copied': 'Tersalin!', 'room.members': 'PEMAIN', 'room.empty': 'Menunggu pemain...', 'room.host': 'Host',
    'room.autoStart': 'Mulai otomatis dalam {s} dtk (kursi kosong diisi bot)', 'room.start': '▶ Mulai Sekarang (isi bot)', 'room.waitHost': 'Menunggu host memulai...', 'room.leave': 'Keluar Ruang',
    'online.timeout': '{name} kehabisan waktu', 'online.autopilot': '{name} dialihkan ke autopilot', 'online.takeover': '{name} keluar, digantikan bot', 'online.waiting': 'Menunggu {name}...',
    'online.reconnecting': 'Menghubungkan ulang...', 'online.ready': '✔ Siap, ronde berikutnya', 'online.readyWait': 'Ronde berikutnya dalam {s} dtk', 'online.back': 'Kembali ke Lobi',
    'online.abandoned': 'Game dibatalkan karena tidak ada aktivitas.', 'online.leaveConfirm': 'Keluar dari game? Kursi Anda akan diambil alih bot.',
    'online.err.generic': 'Aksi ditolak server.', 'online.err.not_your_turn': 'Bukan giliran Anda.', 'online.err.invalid_eat': 'Makan tidak valid.', 'online.err.invalid_meld': 'Seri tidak valid.',
    'online.err.ace_locked': 'As tidak boleh dibuang sebelum punya seri jadi.', 'online.err.cannot_close': 'Tidak bisa menutup ronde.',
    'help.title': '📜 Cara Bermain IMPOSSIBLE REMI', 'help.gotIt': 'Mengerti, ayo bermain!',
    'help.body': `<p><b>🎯 Tujuan:</b><br>Kumpulkan skor dari seri kartu. Pemain pertama yang mencapai target room (<b>300 / 500 / 1000</b>) menang. Jika skor puncak sama persis, ronde dilanjutkan sampai ada yang unggul.</p>
<p><b>🎴 Seri yang Valid:</b></p><ul>
<li><b>Angka:</b> minimal 3 kartu 2-10 berurutan, satu simbol (♠3 ♠4 ♠5).</li>
<li><b>Gambar:</b> hanya J-Q-K satu simbol. Tidak boleh campur (10-J-Q atau Q-K-A tidak valid).</li>
<li><b>As:</b> 3 atau 4 As, simbol bebas, boleh diserikan kapan saja (mis. punya 2 As lalu menarik As ketiga). Namun As baru boleh dibuang atau dimakan dari pool setelah Anda punya seri jadi. 1-2 As yang tidak jadi seri dihitung minus.</li>
<li>Seri yang sudah turun tidak bisa ditambah kartu lagi.</li></ul>
<p><b>🔄 Giliran Anda:</b></p><ol>
<li><b>Tarik:</b> klik tumpukan. Jika kartunya bisa membentuk seri, Anda boleh langsung menurunkannya atau menyimpannya di tangan.</li>
<li><b>Atau makan dari Pool:</b> pilih dulu kartu pendamping di tangan. Kartu pool yang cocok (dari 7 teratas) akan menyala; klik untuk makan.<ul>
<li>Pendamping harus berurutan di satu sisi: 9♦ dimakan dengan 7♦+8♦ (boleh ditambah 10♦). 8♦+10♦ tidak bisa.</li>
<li>J dimakan dengan Q+K, K dengan J+Q. <b>Q tidak bisa dimakan</b>, jadi aman dibuang.</li>
<li>As: butuh minimal 2 As di tangan dan sudah punya seri jadi.</li>
<li>Semua kartu di atas kartu pilihan ikut terambil; yang tidak jadi seri tetap di tangan.</li></ul></li>
<li><b>Susun Seri Manual:</b> pilih kartu di tangan lalu tekan SERIKAN (saat fase tarik, atau lewat tombol Susun Seri saat fase buang).</li>
<li><b>Buang:</b> klik 1 kartu untuk dibuang ke pool.</li></ol>
<p><b>⚠️ Batas & Denda:</b></p><ul>
<li>Maksimal 7 kartu di tangan setelah buang. Kelebihannya wajib dicabut tertutup secara acak; nilainya minus ×10 (angka -50, gambar -100, As -150).</li>
<li>Kartu sisa di tangan saat ronde berakhir bernilai minus (angka -5, gambar -10, As -15).</li></ul>
<p><b>🏁 Akhir Ronde:</b></p><ul>
<li><b>REMI:</b> semua kartu di tangan jadi seri (setelah tarik, makan, atau susun manual) → bonus +25. Ronde selesai untuk pemain itu saja; pemain lain terus bermain sampai ronde berakhir.</li>
<li><b>CLOSED:</b> sisa 1 kartu, buang tertutup: angka +50, gambar +100, As +150. Ini mengakhiri ronde untuk semua pemain.</li>
<li><b>Tumpukan habis:</b> jika sudah ada seri milik siapa pun, ronde selesai dan skor dihitung. Jika belum ada seri sama sekali, pool dikocok ulang sekali; bila tumpukan habis lagi dan tetap belum ada seri, ronde selesai.</li></ul>
<p><b>🤖 Bot:</b> Easy (acak, jarang makan), Medium (cukup cerdas), Hard (menghitung kartu yang sudah terlihat, menahan As untuk set 4, menghindari denda). Semua bot memakai aturan yang sama dengan Anda.</p>
<p><b>📜 Log Aksi:</b> tombol 📜 di kanan atas menampilkan riwayat langkah semua pemain.</p>
<p><b>Nilai kartu:</b> As 15, J/Q/K 10, angka 5.</p>`
  },
  en: {
    'menu.sub': 'Enjoy the traditional Remi game that is impossible!',
    'menu.room': 'ROOM (TARGET SCORE)', 'menu.level': 'BOT LEVEL',
    'menu.play': '▶ PLAY GAME', 'menu.help': '❓ HOW TO PLAY',
    'prof.title': '👤 Player Profile', 'prof.name': 'NAME', 'prof.namePh': 'Enter your name...',
    'prof.avatar': 'CHOOSE AVATAR', 'prof.upload': '📷 Upload Photo', 'prof.start': '▶ Start Playing', 'prof.back': '← Back',
    'prof.defaultName': 'Player',
    'ph.draw': 'Draw / Eat', 'ph.discard': 'Discard 1 card', 'ph.pluck': 'Pluck a card', 'ph.deal': 'Dealing', 'ph.over': 'Round over', 'ph.wait': 'Processing', 'ph.init': '',
    'hud.remi': 'REMI ✓',
    'help.btn': 'How to Play', 'size.btn': 'Card size (S / M / L)', 'log.title': '📜 Action Log', 'log.btn': 'Action log', 'lang.btn': 'Language',
    'btn.meldMode': '🎴 Arrange Meld', 'btn.meldCancel': '✖ Cancel Meld', 'btn.doMeld': '✅ MELD', 'btn.cancel': 'Cancel', 'btn.close': '🔒 CLOSE (CLOSED)',
    'rotate.msg': 'Rotate your device to landscape to play',
    'meld.title': '🎴 Confirm Meld', 'meld.yes': 'Make Meld (+Points)', 'meld.no': 'Keep in Hand',
    'meld.drawn': 'The drawn card {card} can form a Meld! Do you want to meld it now?',
    'meld.more': 'Your hand still has another possible Meld. Do you want to meld it now?',
    'msg.shuffling': 'Shuffling the cards...', 'msg.dealing': 'Dealing the cards...',
    'msg.yourTurn': 'Your turn: click the deck to draw, or pick companion cards in your hand: eatable pool cards will glow.',
    'msg.thinking': '{name} is thinking...', 'msg.choosing': '{name} is choosing a card...',
    'msg.deckEndMeld': 'The deck is empty and a meld is on the table. Round over!',
    'msg.deckEndNone': 'The deck ran out again and there is still no meld. Round over!',
    'msg.reshuffle': 'No melds yet! The deck is empty, the pool is reshuffled (last chance)...',
    'msg.discard': 'Discard 1 card to the pool (click a card).', 'msg.discardClose': ' Or close the round with the CLOSE button.',
    'msg.pluck': 'More than 7 cards: you must pluck 1 face-down card (placed in the penalty area).',
    'msg.roundOver': 'Round over! Revealing all hands...',
    'msg.eatHint': 'Glowing pool cards can be eaten: click one to eat.', 'msg.orMeld': ' Or press MELD to lay down a meld.',
    'msg.meldOk': 'Valid combination! Press MELD to lay it down.',
    'msg.selCount': '{n} card(s) selected. Pick 2 consecutive companions to eat from the pool, or 3+ cards for a meld.',
    'msg.idleDraw': 'Click the deck to draw, or pick companion cards in your hand.',
    'msg.meldDoneDiscard': 'Meld laid down! Discard 1 card to the pool.', 'msg.meldDoneDraw': 'Meld laid down! Click the deck to draw, or pick companions to eat.',
    'msg.pickFirst': 'Pick companion cards in your hand first; eatable pool cards will glow.',
    'msg.max7': 'At most 7 cards from the top of the pool.',
    'msg.noMatch': 'This pool card does not match your companions (they must be consecutive on one side).',
    'msg.aceNo': 'Aces cannot be discarded before you have a completed meld.', 'msg.cancelSel': 'Selection cleared.',
    'msg.meldMode': 'Meld mode: click the hand cards you want to meld (at least 3).',
    'msg.remiWait': '{name} got REMI! The others play on until the round ends.',
    'log.meld': 'laid down meld {cards} (+{v})', 'log.round': '— Round {n} · Room {room} · first: {name} —',
    'log.drawBot': 'drew 1 card from the deck', 'log.drawYou': 'drew {card} from the deck',
    'log.eat': 'ate {k} card(s) from the pool ({cards})', 'log.discard': 'discarded {card}',
    'log.closed': 'closed the round (CLOSED) with 1 face-down card', 'log.pluck': 'plucked 1 face-down card (penalty)',
    'log.deckEndMeld': 'Deck empty & a meld exists → round over',
    'log.deckEndNone': 'Deck empty again after the reshuffle & still no meld → round over',
    'log.reshuffle': 'No meld on the table yet → pool reshuffled into the deck (last chance)',
    'log.closedBy': '{name} closed the round', 'log.noWinner': 'Round over', 'log.win': '🏆 {name} reached {score} and wins!',
    'log.remi': 'REMI! All cards melded (+25). Out for this round.',
    'banner.yourTurn': 'Your turn', 'banner.turnOf': "{name}'s turn", 'banner.remi': 'REMI! {name}',
    'score.title': 'Round Over', 'score.closed': 'CLOSED by {name}', 'score.remiList': 'REMI: {names}',
    'score.player': 'Player', 'score.meld': 'Melds', 'score.minus': 'Penalty', 'score.round': 'Round', 'score.total': 'Total',
    'score.win': '🏆 {name} WINS WITH A SCORE OF {score}!', 'score.again': 'Play Again (Choose Room)',
    'score.tie': '⚖️ Tied at the top ({score}). The next round decides.', 'score.next': 'Next Round',
    'menu.online': '🌐 ONLINE', 'online.leave': 'Leave game',
    'auth.title.login': '🔐 Sign In', 'auth.title.register': '📝 Create Account', 'auth.email': 'EMAIL', 'auth.password': 'PASSWORD', 'auth.name': 'DISPLAY NAME',
    'auth.login': 'Sign In', 'auth.register': 'Sign Up', 'auth.toRegister': 'No account yet? Sign up', 'auth.toLogin': 'Already have an account? Sign in', 'auth.forgot': 'Forgot password?',
    'auth.forgotSent': 'A password reset link has been sent to your email.', 'auth.confirmSent': 'Sign-up successful! Check your email to confirm, then sign in.',
    'auth.back': '← Back', 'auth.logout': 'Sign out', 'auth.enterEmail': 'Enter your email first.', 'auth.busy': 'Working...',
    'auth.err.invalid_credentials': 'Wrong email or password.', 'auth.err.email_not_confirmed': 'Email not confirmed yet. Check your inbox.',
    'auth.err.user_already_exists': 'This email is already registered.', 'auth.err.weak_password': 'Password too weak (at least 8 characters).',
    'auth.err.rate': 'Too many attempts. Try again later.', 'auth.err.email': 'Enter a valid email.', 'auth.err.network': 'Cannot reach the server.', 'auth.err.generic': 'Something went wrong. Try again.',
    'lobby.title': '🌐 Online Lobby', 'lobby.hello': 'Hello, {name}!', 'lobby.chips': '🪙 {n} chips', 'lobby.quick': 'QUICK MATCH', 'lobby.room': 'ROOM', 'lobby.level': 'BOT LEVEL (fills empty seats)',
    'lobby.find': '🔎 Find Opponents', 'lobby.create': 'PRIVATE ROOM', 'lobby.password': 'Room password (optional)', 'lobby.createBtn': 'Create Room', 'lobby.join': 'JOIN WITH CODE', 'lobby.code': 'Room code',
    'lobby.joinBtn': 'Join', 'lobby.profile': 'PROFILE', 'lobby.save': 'Save', 'lobby.saved': 'Saved.', 'lobby.back': '← Menu', 'lobby.resume': '▶ Resume game ({code})',
    'lobby.err.wrong_password': 'Wrong room password.', 'lobby.err.room_not_found': 'Room not found.', 'lobby.err.room_full': 'The room is full.', 'lobby.err.room_started': 'The game in this room has already started.',
    'lobby.err.already_in_room': 'You are still in another room.', 'lobby.err.too_many_requests': 'Too many attempts. Please wait a moment.', 'lobby.err.unauthorized': 'Session expired. Please sign in again.',
    'lobby.err.busy': 'Server busy, try again.', 'lobby.err.network': 'Cannot reach the server.', 'lobby.err.generic': 'Something went wrong. Try again.', 'lobby.err.bad_password': 'Room password must be 4-32 characters.',
    'room.title': 'Room {code}', 'room.share': 'Share this code with your friends', 'room.copy': '📋 Copy', 'room.copied': 'Copied!', 'room.members': 'PLAYERS', 'room.empty': 'Waiting for player...', 'room.host': 'Host',
    'room.autoStart': 'Starts automatically in {s} s (empty seats are filled with bots)', 'room.start': '▶ Start Now (fill with bots)', 'room.waitHost': 'Waiting for the host to start...', 'room.leave': 'Leave Room',
    'online.timeout': '{name} ran out of time', 'online.autopilot': '{name} switched to autopilot', 'online.takeover': '{name} left, replaced by a bot', 'online.waiting': 'Waiting for {name}...',
    'online.reconnecting': 'Reconnecting...', 'online.ready': '✔ Ready, next round', 'online.readyWait': 'Next round in {s} s', 'online.back': 'Back to Lobby',
    'online.abandoned': 'The game was cancelled due to inactivity.', 'online.leaveConfirm': 'Leave the game? A bot will take over your seat.',
    'online.err.generic': 'Action rejected by the server.', 'online.err.not_your_turn': 'It is not your turn.', 'online.err.invalid_eat': 'Invalid eat.', 'online.err.invalid_meld': 'Invalid meld.',
    'online.err.ace_locked': 'Aces cannot be discarded before you have a completed meld.', 'online.err.cannot_close': 'Cannot close the round.',
    'help.title': '📜 How to Play IMPOSSIBLE REMI', 'help.gotIt': 'Got it, let\'s play!',
    'help.body': `<p><b>🎯 Goal:</b><br>Score points by making melds. The first player to reach the room target (<b>300 / 500 / 1000</b>) wins. If the top scores are exactly equal, play continues until someone leads.</p>
<p><b>🎴 Valid Melds:</b></p><ul>
<li><b>Number cards:</b> at least 3 consecutive cards from 2-10, one suit (♠3 ♠4 ♠5).</li>
<li><b>Face cards:</b> only J-Q-K of one suit. No mixing (10-J-Q or Q-K-A is invalid).</li>
<li><b>Aces:</b> 3 or 4 Aces, any suits, can be melded at any time (e.g. hold 2 Aces, then draw the third). However, Aces can only be discarded or eaten from the pool after you already have a completed meld. 1-2 Aces left unmelded count as penalty.</li>
<li>A meld that is already on the table cannot be extended.</li></ul>
<p><b>🔄 Your Turn:</b></p><ol>
<li><b>Draw:</b> click the deck. If the card can form a meld you may lay it down right away or keep it in hand.</li>
<li><b>Or eat from the Pool:</b> first pick companion cards in your hand. Matching pool cards (among the top 7) will glow; click one to eat.<ul>
<li>Companions must be consecutive on one side: 9♦ can be eaten with 7♦+8♦ (optionally plus 10♦). 8♦+10♦ does not work.</li>
<li>J is eaten with Q+K, K with J+Q. <b>Q can never be eaten</b>, so it is safe to discard.</li>
<li>Ace: you need at least 2 Aces in hand and an existing meld.</li>
<li>All cards above the chosen one are taken too; those that do not form a meld stay in your hand.</li></ul></li>
<li><b>Manual Meld:</b> pick cards in your hand and press MELD (in the draw phase, or via the Arrange Meld button in the discard phase).</li>
<li><b>Discard:</b> click 1 card to put it on the pool.</li></ol>
<p><b>⚠️ Limits &amp; Penalties:</b></p><ul>
<li>At most 7 cards in hand after discarding. Extra cards must be plucked face-down at random; their value is minus ×10 (number -50, face -100, Ace -150).</li>
<li>Cards left in hand at the end of the round count as minus (number -5, face -10, Ace -15).</li></ul>
<p><b>🏁 End of Round:</b></p><ul>
<li><b>REMI:</b> every card in your hand becomes a meld (after drawing, eating or a manual meld) → +25 bonus. The round is over for that player only; the others keep playing until the round ends.</li>
<li><b>CLOSED:</b> with 1 card left, discard it face-down: number +50, face +100, Ace +150. This ends the round for everyone.</li>
<li><b>Deck runs out:</b> if anyone has a meld the round ends and scores are counted. If there are no melds at all, the pool is reshuffled once; if the deck runs out again with still no meld, the round ends.</li></ul>
<p><b>🤖 Bots:</b> Easy (random, rarely eats), Medium (fairly smart), Hard (counts seen cards, holds Aces for a set of 4, avoids penalties). Bots follow the same rules as you.</p>
<p><b>📜 Action Log:</b> the 📜 button in the top-right shows every player's moves.</p>
<p><b>Card values:</b> Ace 15, J/Q/K 10, numbers 5.</p>`
  }
};
let lang = 'id';
try { lang = localStorage.getItem('remiLang') || ((navigator.language || 'id').toLowerCase().startsWith('id') ? 'id' : 'en'); } catch (e) {}
if (!D[lang]) lang = 'id';
export const LANGS = Object.keys(D);
export const dict = D;
export const getLang = () => lang;
export function setLang(l) { if (D[l]) { lang = l; try { localStorage.setItem('remiLang', l); } catch (e) {} } }
export function tr(key, vars) {
  let s = (D[lang] && D[lang][key]) ?? D.id[key] ?? key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = tr(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = tr(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = tr(el.dataset.i18nTitle); });
  if (root === document) document.documentElement.lang = lang;
}
