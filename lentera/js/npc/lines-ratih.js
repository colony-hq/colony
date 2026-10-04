// Writing: Bu Ratih — chatty warung owner, the village's gossip hub. Pure data (see lines.js).

export default {
  id: 'ratih',
  name: 'Bu Ratih',
  role: 'Pemilik warung',
  where: 'Warung kampung',
  bio: () => 'Punya warung di kampung. Sumber gosip nomor satu — dan herannya, gosipnya sering benar.',
  persona: 'Kamu Bu Ratih, pemilik warung yang cerewet dan hangat. Suka bergosip, kalimat panjang dan melompat-lompat ("ya ampun", "eh", "lho", "pokoknya"). Menyebut diri "Ibu", memanggil lawan bicara "Nak".',

  greetings: [
    { when: (h) => h.step === 'done',
      text: 'Ya ampun, MATAHARI! Kamu lihat itu? Hari ini gorengan gratis! …Satu orang satu, ya. Jangan bilang Pak Darto.' },
    { when: (h) => h.step === 'finale',
      text: 'Eh, eh, menaranya! Ibu sampai lupa matiin kompor!' },
    { when: (h) => h.has('tirta'),
      text: 'Itu Api Tirta?! Ya ampun, dingin-dingin terang gitu. Satu kampung pasti lagi ngomongin kamu sekarang. Ya, maksudnya Ibu yang ngomongin.' },
    { when: (h) => h.placed > 0,
      text: 'Katanya ada cahaya di mercusuar semalam. Ibu belum lihat sendiri, tapi udah cerita ke tiga orang. Empat, sama kucing.' },
    { when: (h) => h.visits === 0,
      text: 'Eh, eh, eh! Muka baru! Sini, sini. Kamu yang datang naik perahu tadi, kan? Satu kampung udah tahu — kabar di sini lebih cepat dari angin. Mau tanya-tanya boleh, tapi ya… mikir itu ada harganya, Nak.' },
    { when: () => true,
      text: [
        'Balik lagi? Pasti kangen gorengan Ibu. Atau kangen gosip?',
        'Duduk, duduk. Tehnya masih anget. Mau tanya apa?',
        'Eh, kamu. Tadi ada yang nanyain kamu. Siapa? Ya Ibu sendiri.',
      ] },
  ],

  more: ['Terus, terus? Mau tanya apa lagi?', 'Ada lagi, Nak? Ibu masih banyak cerita.', 'Apa lagi? Jangan malu-malu.'],

  bye: [
    { when: () => true,
      text: ['Nanti mampir lagi, ya! Ibu simpenin gorengan.', 'Hati-hati, Nak! Kalau ketemu Laras, suruh makan!', 'Dadah! Jangan lupa cerita ke Ibu kalau ada apa-apa!'] },
  ],

  topics: [
    {
      id: 'menu',
      label: 'Menu hari ini',
      ask: 'Hari ini ada menu apa, Bu?',
      kind: 'catatan',
      redup: {
        text: 'Menu hari ini: nasi kabut, sayur kabut, es teh kabut. Kabutnya gratis, tehnya bayar. Eh, tehnya habis. Jadi kabutnya aja, ya, Nak? Masih anget, baru diangkat.',
      },
      sedang: {
        text: 'Ada pisang goreng, nasi jagung, sama ikan asin kiriman Pak Darto. Ikannya agak… ya, namanya juga Pak Darto.',
      },
      terang: {
        text: 'Nasi jagung, sayur lodeh, sambal terasi bikinan Ibu sendiri, sama ikan asin dari Pak Darto — yang ini asinnya pas, bukan yang kemarin. Pisang goreng tinggal dua: satu buat kamu, satu buat Laras. Anak itu lupa makan kalau udah gambar candi di utara. Kamu juga jangan lupa makan, ya. Nyari api juga butuh tenaga.',
        clue: { id: 'menu_ratih', text: 'Bu Ratih menyisihkan pisang goreng untuk Laras, mahasiswi yang tiap hari menggambar candi di utara.' },
      },
    },
    {
      id: 'gosip',
      label: 'Gosip kampung',
      ask: 'Ada gosip apa, Bu?',
      kind: 'catatan',
      redup: {
        text: 'Gosipnya gini: Pak Darto itu sebenarnya ikan. Iya! Makanya betah di laut. Terus Mbah Sarni itu sebenarnya… Mbah Sarni. Udah, itu aja gosipnya. Jangan bilang-bilang.',
      },
      sedang: {
        text: 'Pak Darto itu galak, tapi hatinya lembek. Laras anak kota, ke sini buat skripsi, nggak pulang-pulang. Terus Mbah Sarni tiap pagi bikin dua gelas kopi. Buat siapa? Ya tanya sendiri, lah.',
      },
      terang: {
        text: 'Oke, ini rahasia, ya. Mbah Sarni tiap pagi bikin dua gelas kopi: satu buat dia, satu buat suaminya, Ki Lamun, penjaga mercusuar yang hilang dua puluh tahun lalu. Pak Darto dulu murid Ki Lamun, makanya jutek kalau ditanya soal menara — sebenarnya dia sedih. Terus Laras, nah, itu anak pintar. Dia yang paling ngerti candi di utara. Ibu sih cuma ngerti harga cabai.',
        flags: ['heard_lamun'],
        clue: { id: 'gosip_ratih', text: 'Mbah Sarni masih membuat dua gelas kopi tiap pagi — satu untuk Ki Lamun. Pak Darto dulu murid Ki Lamun. Laras paling paham soal candi.' },
      },
    },
    {
      id: 'loc_tirta',
      label: 'Api Tirta',
      ask: 'Bu, tahu soal Api Tirta?',
      kind: 'petunjuk',
      unlock: (h) => h.atLeast('kindle'),
      lockHint: 'Setelah api unggun kampung menyala',
      redup: {
        text: 'Api Tirta? Itu merek air galon, Nak. Yang tutupnya biru. Ibu langganan. Mau Ibu pesenin? Tapi kurirnya hilang di kabut. Udah tiga bulan. Galonnya juga.',
      },
      sedang: {
        text: 'Orang dulu bilang Api Tirta ada dekat air terjun di barat. Ada yang bilang di bawah airnya, ada yang bilang di atasnya. Ibu sih nggak pernah ke sana. Licin.',
        clue: { id: 'loc_tirta_samar', text: 'Api Tirta ada di dekat air terjun di barat — di bawah airnya, atau di atasnya?' },
      },
      terang: {
        text: 'Dengerin, ya. Dari kampung ikut jalan ke barat, di pertigaan belok kanan ke utara, terus aja sampai telaga. Air terjunnya di ujung telaga, jatuh dari tebing. Nah, di BALIK air yang jatuh itu ada gua — almarhum bapak Ibu dulu sembunyi di situ kalau dimarahi nenek. Api Tirta ada di dalam, putih kebiruan, dingin tapi terang. Siap-siap basah, ya, Nak!',
        clue: { id: 'loc_tirta', text: 'Api Tirta ada di gua di balik air terjun, di ujung telaga barat. Dari kampung ke barat, di pertigaan belok kanan (utara).' },
      },
    },
    {
      id: 'kilau',
      label: 'Kilau hijau',
      ask: 'Bu, kilau hijau di jalan itu apa?',
      kind: 'catatan',
      redup: {
        text: 'Kilau hijau itu kunang-kunang yang lagi diet, Nak. Makanya diam terus, hemat tenaga. Jangan dimakan, ya. Ibu pernah coba. Rasanya kayak cahaya. Hambar.',
      },
      sedang: {
        text: 'Itu sisa-sisa cahaya, katanya. Kalau dipungut, kantong pikiranmu nambah sedikit. Banyak di jalan setapak.',
      },
      terang: {
        text: 'Kilau itu remah-remah pikiran yang dulu dibuang orang sini, Nak. Tiap butir yang kamu pungut nambah CREDIT sedikit — nol koma nol nol tiga — tapi lama-lama jadi bukit. Banyak di sepanjang jalan setapak, dan biasanya ada di tempat tinggi: atap rumah, puncak gunung, tiang kapal karam, teras candi. Orang yang suka manjat jarang bokek.',
        clue: { id: 'kilau', text: 'Kilau hijau: +0.003 CREDIT tiap butir. Banyak di jalan setapak dan di tempat tinggi — atap, puncak gunung, tiang kapal karam, teras candi.' },
      },
    },
  ],
};
