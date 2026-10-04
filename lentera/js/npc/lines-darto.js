// Writing: Pak Darto — blunt fisherman, short sentences, sea slang. Pure data (see lines.js).

export default {
  id: 'darto',
  name: 'Pak Darto',
  role: 'Nelayan',
  where: 'Dermaga',
  bio: (h) => (h.clue('gosip_ratih')
    ? 'Nelayan di dermaga. Bicaranya pendek. Dulu murid Ki Lamun — makanya jutek kalau ditanya soal menara.'
    : 'Nelayan di dermaga. Bicaranya pendek, tapi paham laut, angin, dan kapal karam di pantai barat.'),
  persona: 'Kamu Pak Darto, nelayan tua yang ketus dan irit kata. Kalimat pendek, istilah laut (haluan, buritan, pasang, surut). Memanggil lawan bicara "kau" atau "Dik". Diam-diam lembut.',

  greetings: [
    { when: (h) => h.step === 'done',
      text: 'Lautnya kelihatan sampai ujung. Besok aku melaut. Kau ikut? …Nggak? Ya sudah. Tadinya mau kuajak.' },
    { when: (h) => h.step === 'finale',
      text: 'Diam. Lihat menaranya. Jangan ngomong dulu.' },
    { when: (h) => h.has('samudra'),
      text: 'Itu api dari Sri Gading? Hah. Kukira cuma dongeng orang mabuk. Ternyata orang mabuknya benar.' },
    { when: (h) => h.placed > 0,
      text: 'Mercusuar kedip semalam. Dua puluh tahun aku nggak lihat itu. Jangan bilang siapa-siapa aku berdiri lama di sini.' },
    { when: (h) => h.visits === 0,
      text: 'Hm. Orang baru. Perahumu tadi hampir nabrak tiang dermaga, tahu? Kalau mau tanya, tanya. Tapi di sini mikir itu ada ongkosnya — jangan buang-buang.' },
    { when: () => true,
      text: [
        'Masih di sini? Kabut segini, ikan aja malas keluar.',
        'Apa lagi? Cepat. Umpanku kering.',
        'Hm. Duduk kalau mau. Jangan injak ember.',
      ] },
  ],

  more: ['Apa lagi?', 'Lanjut. Cepat.', 'Masih ada?'],

  bye: [
    { when: () => true,
      text: ['Hm.', 'Jangan jatuh dari dermaga.', 'Sana. Ikanku kabur kalau kau di sini terus.'] },
  ],

  topics: [
    {
      id: 'loc_samudra',
      label: 'Kapal karam',
      ask: 'Pak, soal kapal karam itu…',
      kind: 'petunjuk',
      redup: {
        text: 'Kapal karam? Tenggelamnya di darat, Dik. Iya, di darat. Makanya namanya karam — karena… ya karam. Coba cari di belakang warung Bu Ratih. Kalau ketemu, panggil aku. Aku juga mau lihat.',
      },
      sedang: {
        text: 'Ada pinisi kandas di pantai barat, sejak malam kabut pertama. Katanya ada api biru di dalamnya. Aku nggak pernah ke sana. Bukan takut. Malas.',
        clue: { id: 'loc_samudra_samar', text: 'Ada pinisi kandas di pantai barat. Katanya ada api biru di dalamnya.' },
      },
      terang: {
        text: 'Pinisi Sri Gading. Kandas di pantai barat malam kabut pertama — haluan nyangkut di pasir, buritan masih di air dalam. Jalan lurus ke barat dari kampung sampai pantai, naik lewat papan di haluan, terus ke buritan. Api Samudra ada di kabin nakhoda, di atas meja. Nyalanya biru; kalau kabut tipis, dari pantai pun kelihatan.',
        clue: { id: 'loc_samudra', text: 'Api Samudra ada di kabin nakhoda di buritan pinisi Sri Gading, yang kandas di pantai barat. Naik lewat papan di haluan.' },
      },
    },
    {
      id: 'mercusuar',
      label: 'Mercusuar',
      ask: 'Mercusuar di timur itu kenapa mati, Pak?',
      kind: 'petunjuk',
      redup: {
        text: 'Mercusuar itu menara yang suaranya "mercu". Mercu! Mercu! Gitu bunyinya tiap malam. Makanya namanya mercu-suara. Sekarang diam. Mungkin serak.',
      },
      sedang: {
        text: 'Di tanjung timur. Dulu nyala tiap malam, yang jaga Ki Lamun — suami Mbah Sarni. Sejak dia hilang, gelap. Ikuti jalan ke timur dari kampung.',
        flags: ['heard_lamun'],
        clue: { id: 'mercusuar_samar', text: 'Mercusuar di tanjung timur — ikuti jalan ke timur dari kampung. Dulu dijaga Ki Lamun.' },
      },
      terang: {
        text: 'Tanjung timur, di ujung jalan dari kampung. Pintunya di sisi barat menara, di kakinya ada tiga tungku batu. Dulu Ki Lamun menyalakannya tiap senja, dan aku pulang melaut tinggal ikuti sinarnya. Sejak dia hilang, aku pulang pakai perasaan. Perasaanku jelek. Soal suaminya, tanya Mbah Sarni.',
        flags: ['heard_lamun'],
        clue: { id: 'mercusuar', text: 'Mercusuar di tanjung timur, di ujung jalan dari kampung. Pintu di sisi barat; tiga tungku batu di kakinya. Dulu dijaga Ki Lamun.' },
      },
    },
    {
      id: 'ikan',
      label: 'Hasil tangkapan',
      ask: 'Dapat ikan apa hari ini, Pak?',
      kind: 'catatan',
      redup: {
        text: 'Hari ini dapat tiga ekor lentera. Eh, lele. Lele laut. Ada ya lele laut? Ada lah, barusan kutangkap. Rasanya kayak lentera. Hangat. Agak berasap.',
      },
      sedang: {
        text: 'Sepi. Sejak kabut, ikan ikut bingung. Kadang dapat tongkol, kadang dapat sandal. Sandal kanan semua. Entah ke mana yang kiri.',
      },
      terang: {
        text: 'Jujur? Nol. Ikan benci kabut, sama kayak orang. Tapi waktu lenteramu lewat dermaga tadi, ada kawanan teri naik ke permukaan, ngikutin cahayanya. Dua puluh tahun aku nunggu ikan naik. Ternyata yang kurang cuma cahaya. Jangan bilang siapa-siapa aku ngomong begini.',
        clue: { id: 'ikan_darto', text: 'Kata Pak Darto, ikan teri naik mengikuti cahaya lentera. Yang kurang dari laut ini cuma cahaya.' },
      },
    },
    {
      id: 'kabut_laut',
      label: 'Selamat di kabut',
      ask: 'Gimana caranya selamat di kabut, Pak?',
      kind: 'catatan',
      redup: {
        text: 'Kabut di laut itu sama kayak kabut di darat, cuma basah. Kompasku muter terus: utara, selatan, utara. Akhirnya kompasnya kujual. Yang beli juga muter.',
      },
      sedang: {
        text: 'Kabut paling tebal di sekitar kapal karam sama gua air terjun. Hantu-hantunya suka di situ. Bawa lentera yang terang. Sudah, itu saja.',
      },
      terang: {
        text: 'Dengar baik-baik. Kabut paling tebal di bangkai kapal, di gua air terjun, dan di sekitar candi. Hantu kabut takut cahaya: kalau mereka mendekat, nyalakan lenteramu sekali besar, bubar semua. Tapi tiap nyala makan minyak. Kalau lenteramu mulai redup, cari api unggun dan istirahat. Orang laut tahu kapan harus menepi.',
        clue: { id: 'kabut_laut', text: 'Kabut paling tebal di kapal karam, gua air terjun, dan candi. Hantu kabut bubar kalau lentera dinyalakan besar. Istirahat di api unggun untuk mengisi lentera.' },
      },
    },
  ],
};
