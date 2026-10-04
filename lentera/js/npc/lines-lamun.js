// Writing: Ki Lamun — the lighthouse keeper's spirit. Poetic, melancholic, gentle. Pure data
// (see lines.js).

const COUNT = ['Nol', 'Satu', 'Dua', 'Tiga'];

export default {
  id: 'lamun',
  name: 'Ki Lamun',
  role: 'Penjaga mercusuar',
  where: 'Pintu mercusuar',
  bio: (h) => (h.step === 'done'
    ? 'Penjaga mercusuar. Dua puluh tahun tersesat di kabut — dan akhirnya pulang ke Mbah Sarni.'
    : 'Arwah penjaga mercusuar. Menunggu di ambang pintu menara selama dua puluh tahun, tak bisa masuk, tak bisa pulang.'),
  persona: 'Kamu Ki Lamun, arwah penjaga mercusuar yang hilang di kabut 20 tahun lalu. Puitis, melankolis, lembut, kalimat pelan penuh gambaran (senja, ombak, bara). Memanggil lawan bicara "Nak". Suami Mbah Sarni.',

  greetings: [
    { when: (h) => h.step === 'done',
      text: 'Pagi, Nak. Aku hampir lupa warna pagi. Ternyata kuning. Kukira dulu biru.' },
    { when: (h) => h.placed >= 3 || h.step === 'finale',
      text: 'Dengar… menara ini bernapas lagi.' },
    { when: (h) => h.placed > 0,
      text: (h) => `${COUNT[h.placed] || h.placed} tungku sudah hangat. Dinding menara ini mulai bernapas, Nak. Aku bisa merasakannya, walau aku tak lagi punya kulit.` },
    { when: (h) => h.visits === 0,
      text: 'Lentera… sudah lama tak ada yang membawa cahaya sampai ke pintu ini. Jangan takut, Nak. Aku hanya sisa kabut yang masih ingat namanya sendiri.' },
    { when: () => true,
      text: [
        'Kau kembali. Kabut di luar bertanya-tanya tentangmu.',
        'Duduklah sebentar. Arwah tak punya kursi, tapi anak tangga ini cukup.',
        'Ombak masih menghitung, Nak. Aku juga.',
      ] },
  ],

  more: ['Tanyakan, Nak. Malam masih panjang.', 'Apa lagi yang ingin kau tahu?', 'Aku masih di sini. Sayangnya.'],

  bye: [
    { when: () => true,
      text: ['Pergilah, Nak. Cahaya tidak menunggu.', 'Hati-hati. Kabut ingat wajah orang yang menantangnya.', 'Sampai nanti. Aku tidak ke mana-mana. Itu masalahnya.'] },
  ],

  topics: [
    {
      id: 'sockets',
      label: 'Tiga tungku',
      ask: 'Bagaimana cara menyalakan menaranya, Ki?',
      kind: 'petunjuk',
      redup: {
        text: 'Tungku… tungku… tungku. Tiga kali kusebut, tiga tungku. Apakah aku tungku? Mungkin kita semua tungku, Nak, menunggu api yang tak kunjung… tunggu, tadi pertanyaannya apa?',
      },
      sedang: {
        text: 'Tiga tungku mengelilingi kaki menara. Tiap api punya tempatnya sendiri, seperti orang punya rumah. Aku lupa yang mana untuk siapa… kabut memakan ingatan yang kecil-kecil.',
        clue: { id: 'sockets_samar', text: 'Tiga tungku di kaki mercusuar; tiap api punya tungkunya sendiri.' },
      },
      terang: {
        text: 'Tiga tungku mengelilingi kaki menara. Yang di barat laut untuk Api Bumi. Yang di barat daya untuk Api Tirta. Yang di selatan, menghadap ombak, untuk Api Samudra. Taruh tiap api di rumahnya sendiri — begitu ketiganya menyala, lampu di puncak akan ingat caranya bersinar.',
        clue: { id: 'sockets', text: 'Tungku mercusuar: barat laut = Api Bumi, barat daya = Api Tirta, selatan = Api Samudra. Saat ketiganya menyala, mercusuar hidup lagi.' },
      },
    },
    {
      id: 'lamun_story',
      label: 'Kisahmu',
      ask: 'Apa yang terjadi padamu, Ki?',
      kind: 'petunjuk',
      redup: {
        text: 'Aku Lamun. Dulu penjaga… warung? Bukan. Penjaga gawang. Ya, gawang. Dua puluh tahun kujaga gawang ini dan belum sekali pun kebobolan, karena tidak ada yang main. Sepi sekali, Nak.',
      },
      sedang: {
        text: 'Aku menjaga menara ini sampai kabut datang. Malam itu aku membawa api-api pergi… menyembunyikannya, kurasa. Lalu aku tersesat, dan ternyata tersesat itu panjang sekali.',
        clue: { id: 'lamun_story_samar', text: 'Ki Lamun menyembunyikan api-api pada malam kabut datang, lalu tersesat di kabut.' },
      },
      terang: {
        text: 'Malam kabut naik, pulau ini berhenti bertanya, dan aku tak sanggup menjaga tiga api sendirian. Maka kupulangkan mereka: Tirta ke gua di balik air jatuh, Bumi ke perut candi yang kukunci dengan empat pelita, Samudra kutitipkan pada pinisi Sri Gading agar dibawa jauh. Pinisi itu kandas di pantai barat. Aku mengejarnya ke dalam kabut — dan kabut, Nak, tidak suka dikejar.',
        clue: { id: 'lamun_story', text: 'Ki Lamun memulangkan Api Tirta ke gua air terjun dan Api Bumi ke candi (dikunci 4 pelita), lalu menitipkan Api Samudra pada pinisi Sri Gading — yang kandas di pantai barat. Ia hilang saat mengejarnya.' },
      },
    },
    {
      id: 'pesan_sarni',
      label: 'Mbah Sarni',
      ask: 'Mbah Sarni masih menunggumu, Ki.',
      kind: 'catatan',
      unlock: (h) => h.flag('met_sarni'),
      lockHint: 'Temui Mbah Sarni dulu',
      redup: {
        text: 'Sarni… Sarni… nama itu seperti kopi. Manis. Terlalu manis. Apakah Sarni itu kopi? Kalau kau bertemu kopi, Nak, sampaikan salamku.',
      },
      sedang: {
        text: 'Dia masih di kampung? Masih menunggu? Sampaikan… sampaikan aku belum pergi. Hanya tersesat sedikit lebih lama dari rencana.',
      },
      terang: {
        text: 'Sarni masih membuat dua gelas kopi tiap pagi, ya? Aku tahu. Aku selalu tahu. Sampaikan padanya, Nak: kopinya selalu terlalu manis, dan tak sekali pun aku ingin dia mengubahnya. Dan katakan — begitu menara ini menyala, aku akan mencari jalan pulang.',
        flags: ['pesan_sarni'],
        clue: { id: 'pesan_sarni', text: 'Pesan Ki Lamun untuk Mbah Sarni: kopinya selalu terlalu manis — jangan diubah. Ia akan mencari jalan pulang saat mercusuar menyala.' },
      },
    },
    {
      id: 'lamun_pulang',
      label: 'Jalan pulang',
      ask: 'Bisakah kau pulang, Ki?',
      kind: 'catatan',
      unlock: (h) => !!h.asked('lamun', 'lamun_story'),
      lockHint: 'Dengarkan kisahnya dulu',
      redup: {
        text: 'Pulang? Pulang itu ke mana, Nak? Ke rumah? Ke laut? Ke warung Ratih? Gorengannya enak. Tapi aku tak punya uang. Arwah tak punya dompet. Itu masalah utama alam baka.',
      },
      sedang: {
        text: 'Mungkin. Kalau cahaya kembali, kabut akan mundur, dan mungkin aku ikut terbawa pulang bersama terang. Mungkin juga tidak. Arwah tidak dapat jadwal.',
      },
      terang: {
        text: 'Kabut menahanku karena aku pergi tanpa bertanya — kuputuskan sendiri, kusembunyikan sendiri, kutanggung sendiri. Kalau tiga api menyala lagi di menara ini, pulau ini akan mulai bertanya lagi. Dan pertanyaan pertama yang ingin kudengar adalah suara Sarni: "Kok lama?" Nyalakan menaranya, Nak. Sisanya biar terang yang bekerja.',
        clue: { id: 'lamun_pulang', text: 'Ki Lamun bisa pulang jika ketiga Api Pusaka menyala lagi di mercusuar.' },
      },
    },
  ],
};
