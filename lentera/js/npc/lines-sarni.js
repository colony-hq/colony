// Writing: Mbah Sarni — warm village elder, Javanese flavour ("Nak", "lho", "monggo", "ndak").
// Pure data (no imports) so tools can validate it in node. See lines.js for the schema.

export default {
  id: 'sarni',
  name: 'Mbah Sarni',
  role: 'Sesepuh kampung',
  where: 'Api unggun kampung',
  bio: (h) => (h.clue('lamun_story') || h.flag('met_lamun')
    ? 'Sesepuh kampung, istri Ki Lamun. Tiap pagi masih membuat dua gelas kopi. Hafal semua cerita lama pulau ini.'
    : 'Sesepuh kampung. Duduk di dekat api unggun, hafal semua cerita lama pulau ini.'),
  persona: 'Kamu Mbah Sarni, sesepuh kampung di pulau berkabut. Hangat, keibuan, logat Jawa ringan ("Nak", "lho", "monggo", "ndak"). Suamimu Ki Lamun, penjaga mercusuar, hilang di kabut 20 tahun lalu.',

  greetings: [
    { when: (h) => h.step === 'done',
      text: 'Kabutnya sudah pergi, Nak. Dan dia… dia pulang. Dua puluh tahun Mbah bikin kopi dua gelas — akhirnya ada yang minum lagi. Monggo, duduk sini.' },
    { when: (h) => h.flag('pesan_sarni'), once: 'pesan_sarni_told',
      text: 'Kamu ketemu dia, ya? Ndak usah cerita, Mbah lihat dari matamu. …Kopi Mbah kemanisan, katanya? Lho, dua puluh tahun baru protes. Dasar orang tua.' },
    { when: (h) => h.step === 'finale',
      text: 'Lihat ke timur, Nak. Lihat. Mbah ndak berani kedip.' },
    { when: (h) => h.placed > 0,
      text: [
        'Dari sini kelihatan, Nak — ujung timur mulai kelap-kelip lagi. Mbah sampai lupa rasanya lihat itu.',
        'Menaranya mulai hangat, ya? Mbah bisa rasakan dari sini. Terus, Nak. Jangan berhenti di tengah jalan.',
      ] },
    { when: (h) => h.carried > 0,
      text: 'Itu… Api Pusaka? Hangatnya sampai sini, lho. Bawa ke mercusuar di tanjung timur, Nak — atau cari yang lain dulu. Mbah percaya sama lenteramu.' },
    { when: (h) => h.visits === 0,
      text: 'Lho, ada perahu yang sampai juga… Monggo, Nak, mendekat ke api. Lentera itu — sudah lama pulau ini ndak lihat cahaya yang berani jalan sendirian. Tapi ingat, di sini mikir itu ada harganya. Tanya yang perlu saja, ya.' },
    { when: (h) => h.step === 'arrive',
      text: 'Tanya saja, Nak. Mbah dengar.' },
    { when: (h) => h.step === 'kindle',
      text: 'Api unggunnya belum nyala, Nak. Dekatkan lenteramu ke kayu itu, biar kampung ini bisa napas sebentar. Habis itu kita ngobrol lagi.' },
    { when: () => true,
      text: [
        'Kampung jadi terang lagi, matur nuwun. Sekarang tiga Api Pusaka-nya, Nak. Jangan sungkan bertanya — tapi pilih-pilih pertanyaanmu.',
        'Lho, balik lagi? Duduk dulu, hangatkan tangan. Mau tanya apa?',
        'Api unggunnya nyala terus, lho, kayak dulu. Ada yang mau ditanyakan, Nak?',
      ] },
  ],

  // One-time gift when the purse is empty (DESIGN §4).
  gift: 'Lho, kantongmu kosong, Nak? Ndak apa-apa. Nih, Mbah ada sedikit simpanan — nol koma nol lima. Jangan bilang-bilang Bu Ratih, nanti satu kampung ikut minta.',

  more: [
    'Ada lagi yang mau kamu tanyakan, Nak?',
    'Apa lagi, Nak? Mbah masih melek.',
    'Monggo, tanya lagi.',
  ],

  bye: [
    { when: (h) => h.step === 'arrive' || h.step === 'kindle',
      text: 'Nyalakan api unggun itu dulu, Nak. Dekatkan saja lenteramu ke kayunya.' },
    { when: () => true,
      text: ['Hati-hati di kabut, Nak. Jangan lupa makan.', 'Monggo. Lenteramu dijaga, ya.'] },
  ],

  topics: [
    {
      id: 'api_pusaka',
      label: 'Tiga Api Pusaka',
      ask: 'Api Pusaka itu apa, Mbah?',
      kind: 'petunjuk',
      redup: {
        text: 'Api Pusaka itu… ada tiga, Nak. Atau empat. Pokoknya ganjil. Ada Api Tirta, Api Bumi, sama Api… Api Unggun? Wis, pokoknya bawa ke mercon. Eh, mercusuar. Mercon itu buat lebaran.',
      },
      sedang: {
        text: 'Ada tiga api tua, Nak: satu dari air, satu dari tanah, satu dari laut. Dulu ketiganya menyalakan mercusuar di timur. Yang jaga suami Mbah… ah, sudahlah, itu cerita lain.',
        flags: ['heard_lamun'],
        clue: { id: 'api_pusaka_samar', text: 'Tiga api tua — dari air, tanah, dan laut — dulu menyalakan mercusuar di timur.' },
      },
      terang: {
        text: 'Api Tirta dari air, Api Bumi dari tanah, Api Samudra dari laut. Bertiga mereka menyalakan mercusuar di tanjung timur, dan selama menara itu menyala, kabut ndak berani naik ke darat. Yang terakhir menjaganya suami Mbah, Ki Lamun. Kumpulkan ketiganya, Nak, lalu taruh di tungku di kaki menara.',
        flags: ['heard_lamun'],
        clue: { id: 'api_pusaka', text: 'Tiga Api Pusaka: Tirta (air), Bumi (tanah), Samudra (laut). Kumpulkan, lalu taruh di tiga tungku di kaki mercusuar di tanjung timur.' },
      },
    },
    {
      id: 'kabut_origin',
      label: 'Asal-usul kabut',
      ask: 'Kabut ini datang dari mana, Mbah?',
      kind: 'petunjuk',
      redup: {
        text: 'Kabut itu asalnya dari kopi, Nak. Dulu satu pulau ngopi bareng, kopinya kepanasan, uapnya ndak mau turun. Jadilah kabut. Makanya sekarang Mbah ngopinya pakai es. Eh, Mbah ndak punya es. Pantes kabutnya masih ada.',
      },
      sedang: {
        text: 'Dua puluh tahun lalu, orang sini mulai malas bertanya. Katanya mikir itu capek, mahal. Ndak lama, kabut datang dari laut. Mana yang duluan, Mbah ndak tahu — kayak ayam sama telur.',
        clue: { id: 'kabut_origin_samar', text: 'Kabut datang 20 tahun lalu — kira-kira saat orang-orang berhenti bertanya.' },
      },
      terang: {
        text: 'Dulu tiap rumah di sini bertanya, Nak — soal laut, soal bintang, soal tetangga. Lalu orang mulai bilang "ah, mikir itu mahal", dan satu per satu berhenti. Begitu pulau ini diam, kabut naik dari laut dan menelan apa saja yang ndak lagi dipikirkan. Lenteramu itu pertanyaan yang masih menyala, Nak. Makanya kabut minggir.',
        clue: { id: 'kabut_origin', text: 'Kabut naik saat pulau berhenti bertanya karena berpikir terasa terlalu mahal. Cahaya — dan pertanyaan — membuatnya mundur.' },
      },
    },
    {
      id: 'harga_pikiran',
      label: 'Kenapa mikir harus bayar?',
      ask: 'Mbah, kenapa di sini mikir harus bayar?',
      kind: 'catatan',
      redup: {
        text: 'Pikiran itu kayak pikulan, Nak. Dipikul. Berat. Makanya bayar, sama kayak ojek. Kamu pernah naik ojek pikiran? Mbah belum. Katanya mahal. Harus pakai helm.',
      },
      sedang: {
        text: 'Di pulau ini, pikiran butuh minyak, sama kayak lentera. Makin terang, makin boros. Kamu bayarnya pakai CREDIT. Jangan pelit, tapi jangan dibuang-buang juga.',
      },
      terang: {
        text: 'Dulu kami kira bertanya itu gratis, jadi kami bertanya sembarangan. Lalu kami kira bertanya itu kemahalan, jadi kami berhenti sama sekali — dan kabut datang. Yang benar di tengah-tengah, Nak: Redup buat basa-basi, Terang buat hal yang penting. Kilau hijau di jalan itu dipungut, lumayan buat nambah isi kantong.',
        clue: { id: 'harga_pikiran', text: 'Redup murah tapi sering ngawur; Terang mahal tapi jelas — pakai untuk hal penting. Kilau hijau di jalan menambah CREDIT.' },
      },
    },
    {
      id: 'loc_tirta',
      label: 'Api Tirta',
      ask: 'Di mana Api Tirta, Mbah?',
      kind: 'petunjuk',
      unlock: (h) => h.atLeast('kindle'),
      lockHint: 'Setelah api unggun kampung menyala',
      redup: {
        text: 'Api Tirta itu di air, Nak. Di dalam air. Coba cari di ember. Kalau ndak ada, cari di ember sebelah. Ember Mbah ada tiga, satunya bocor — mungkin apinya keluar lewat situ.',
      },
      sedang: {
        text: 'Api Tirta suka tempat yang basah dan berisik. Coba ke barat, Nak, ada telaga dan air terjun di sana. Mbah ingatnya cuma itu.',
        clue: { id: 'loc_tirta_samar', text: 'Api Tirta: tempat yang basah dan berisik di barat — dekat telaga dan air terjun?' },
      },
      terang: {
        text: 'Ikuti jalan ke barat sampai pertigaan, lalu belok ke utara sampai telaga. Air terjunnya jatuh dari tebing di ujung telaga, dan di balik tirai airnya ada gua. Api Tirta tidur di dalam gua itu, Nak. Siap-siap basah, ya.',
        clue: { id: 'loc_tirta', text: 'Api Tirta ada di gua di balik air terjun barat. Dari kampung ke barat, di pertigaan belok utara sampai telaga.' },
      },
    },
    {
      id: 'loc_bumi',
      label: 'Api Bumi',
      ask: 'Kalau Api Bumi, Mbah?',
      kind: 'petunjuk',
      unlock: (h) => h.atLeast('kindle'),
      lockHint: 'Setelah api unggun kampung menyala',
      redup: {
        text: 'Api Bumi disimpan di kandang, Nak. Kandang di bukit selatan. Kambingnya yang jaga, makanya kambing di sini ndak pernah kedinginan. Lho, kok kamu ketawa? Kambing itu hewan yang serius.',
      },
      sedang: {
        text: 'Ada candi tua di bukit sebelah utara. Orang bilang Api Bumi disimpan di dalamnya, tapi pintunya terkunci. Kuncinya… lampu-lampu kecil? Mbah lupa.',
        clue: { id: 'loc_bumi_samar', text: 'Api Bumi mungkin di dalam candi di bukit utara. Pintunya terkunci — ada hubungannya dengan lampu-lampu kecil.' },
      },
      terang: {
        text: 'Api Bumi tidur di ruang dalam candi di bukit utara — jalan setapaknya lewat sisi timur gunung. Pintu batunya cuma terbuka kalau empat pelita di teras pertama dinyalakan dengan urutan yang benar. Urutannya Mbah ndak hafal, tapi ada anak muda, Laras, yang tiap hari menggambar di sana. Tanya dia, Nak.',
        clue: { id: 'loc_bumi', text: 'Api Bumi ada di ruang dalam candi di bukit utara (jalan setapak lewat sisi timur gunung). Pintu terbuka jika 4 pelita di teras pertama dinyalakan dengan urutan benar — tanya Laras.' },
      },
    },
    {
      id: 'lamun_story',
      label: 'Ki Lamun',
      ask: 'Siapa Ki Lamun, Mbah?',
      kind: 'petunjuk',
      unlock: (h) => h.flag('heard_lamun') || h.flag('met_lamun'),
      lockHint: 'Seseorang pernah menyebut namanya…',
      redup: {
        text: 'Ki Lamun? Lamun itu rumput laut, Nak. Berarti suami Mbah rumput laut? Lho, kok Mbah nikah sama rumput laut… Ndak, ndak, ini salah. Tapi kok rasanya benar. Dia memang suka hanyut.',
      },
      sedang: {
        text: 'Suami Mbah. Dulu dia jaga mercusuar. Waktu kabut datang, dia pergi entah ke mana dan ndak pulang. Orang bilang kadang ada bayangan pucat di dekat pintu menara.',
        clue: { id: 'lamun_story_samar', text: 'Ki Lamun, suami Mbah Sarni dan penjaga mercusuar, hilang saat kabut datang. Ada bayangan pucat di pintu menara?' },
      },
      terang: {
        text: 'Ki Lamun itu suami Mbah, penjaga mercusuar. Malam kabut turun, dia bilang, "Apinya kupulangkan ke rumahnya masing-masing, biar ndak ikut ditelan." Lalu dia jalan masuk ke kabut, ke arah pantai barat, dan ndak pernah pulang. Kalau kamu lihat cahaya pucat di pintu mercusuar, sapa dia, ya. Bilang Mbah masih bikin kopinya tiap pagi.',
        clue: { id: 'lamun_story', text: 'Ki Lamun, penjaga mercusuar, memulangkan ketiga api ke tempat asalnya saat kabut datang, lalu hilang. Arwahnya mungkin menunggu di pintu mercusuar.' },
      },
    },
  ],
};
