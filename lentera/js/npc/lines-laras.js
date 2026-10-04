// Writing: Laras — Gen-Z archaeology student sketching the candi ("jujur", "literally", "vibes").
// Pure data (see lines.js).

export default {
  id: 'laras',
  name: 'Laras',
  role: 'Mahasiswi arkeologi',
  where: 'Api unggun candi',
  bio: () => 'Mahasiswi yang sedang skripsi soal relief candi. Menggambar di dekat api unggun candi tiap hari, sering lupa makan.',
  persona: 'Kamu Laras, mahasiswi arkeologi Gen-Z yang sedang skripsi tentang relief candi. Santai, cepat, pakai "aku/kamu", "jujur", "literally", "vibes", "sumpah", "plis", "gas". Pintar dan antusias.',

  greetings: [
    { when: (h) => h.step === 'done',
      text: 'Matahari terbit di candi. Jujur aku nangis dikit. Ini bakal jadi halaman pertama skripsiku. Atau sampulnya. Atau dua-duanya.' },
    { when: (h) => h.step === 'finale',
      text: 'Itu… mercusuarnya? Oke. Oke. Aku nggak nangis. Kamu yang nangis.' },
    { when: (h) => h.has('bumi'),
      text: 'KAMU BUKA PINTUNYA? Aku teriak dalam hati. Boleh aku gambar apinya? Plis. Lima menit aja.' },
    { when: (h) => h.visits === 0,
      text: 'Oh, hai. Sori, lagi nge-sketch. Jujur kaget ada orang naik ke sini — kabutnya literally setebal santan. Aku Laras. Mau ngobrol? Tapi warning, ya: otakku juga bayar per pikiran.' },
    { when: () => true,
      text: [
        'Pintunya masih ketutup. Kayak nunggu password, tapi passwordnya api.',
        'Hai lagi. Bentar, aku selesain garis ini… oke. Kenapa?',
        'Kamu lagi. Nice. Ada update?',
      ] },
  ],

  more: ['Ada lagi? Gas aja.', 'Terus? Aku dengerin kok, sambil gambar.', 'Next question?'],

  bye: [
    { when: () => true,
      text: ['Oke, semangat! Kalau nemu sesuatu, kabarin. Plis.', 'Dadah. Aku lanjut nge-sketch.', 'Hati-hati. Kabutnya beneran nggak ramah.'] },
  ],

  topics: [
    {
      id: 'loc_bumi',
      label: 'Api Bumi',
      ask: 'Kamu tahu di mana Api Bumi?',
      kind: 'petunjuk',
      redup: {
        text: 'Api Bumi ada di… bumi. Planet. Kita lagi di bumi, kan? Berarti udah ketemu. Selamat! Jujur aku nggak nyangka segampang ini. Boleh aku masukin ke skripsi?',
      },
      sedang: {
        text: 'Di dalam candi, kayaknya. Ada ruang di puncak yang pintunya ketutup batu. Aku udah coba dorong, nggak gerak. Pasti ada triknya.',
        clue: { id: 'loc_bumi_samar', text: 'Api Bumi kemungkinan di ruang puncak candi. Pintunya batu dan tidak bisa didorong — pasti ada triknya.' },
      },
      terang: {
        text: 'Api Bumi ada di ruang dalam di puncak candi. Naik tangga sisi selatan, lewati tiga teras — pintunya di sisi selatan bangunan utama. Batunya nggak bisa didorong (aku udah coba, jangan ketawa). Kuncinya empat pelita di sudut-sudut teras pertama: nyalain dengan urutan yang bener, pintunya geser sendiri.',
        clue: { id: 'loc_bumi', text: 'Api Bumi ada di ruang dalam di puncak candi; pintu di sisi selatan. Pintu terbuka jika 4 pelita di teras pertama dinyalakan dengan urutan benar.' },
      },
    },
    {
      id: 'pelita_order',
      label: 'Urutan pelita',
      ask: 'Urutan nyalain pelitanya gimana?',
      kind: 'petunjuk',
      unlock: (h) => h.askedAny('loc_bumi') || !!h.asked('laras', 'skripsi') || h.flag('read_relief') || h.pelita > 0 || h.has('bumi'),
      lockHint: 'Tanya soal Api Bumi dulu',
      redup: {
        text: 'Urutannya: kiri, kanan, kiri, kanan, terus muter, terus tepuk tangan. Eh, itu senam pagi. Sori, aku ngantuk. Tapi jujur, kalau kamu senam di depan candi, vibes-nya pasti dapet.',
      },
      sedang: {
        text: 'Di relief ada orang ngikutin matahari, tapi mulainya dari utara. Jadi… ikuti arah matahari, mulai dari utara? Aku belum berani nyoba. Takut salah terus apinya padam semua.',
        clue: { id: 'pelita_order_samar', text: 'Pelita candi: "ikuti arah matahari, tapi mulai dari utara." Salah urutan = semua padam (coba lagi).' },
      },
      terang: {
        text: 'Udah kupecahin, sumpah: UTARA, TIMUR, SELATAN, BARAT. "Bintang yang nggak pernah bergeser" di relief itu bintang utara — jadi mulai dari utara, terus muter searah jarum jam. Kalau salah, semua pelita padam, nggak ada hukuman, tinggal ulang. Gas.',
        clue: { id: 'pelita_order', text: 'Urutan pelita di teras pertama candi: utara → timur → selatan → barat (searah jarum jam). Salah urutan? Semua padam, ulang saja.' },
      },
    },
    {
      id: 'skripsi',
      label: 'Skripsi Laras',
      ask: 'Skripsimu tentang apa?',
      kind: 'catatan',
      redup: {
        text: 'Skripsiku tentang… candi. Atau kandang? Kayaknya kandang. "Kandang Abad Ke-9 dan Pengaruhnya terhadap Kambing Modern." Jujur dosenku belum baca. Aku juga belum.',
      },
      sedang: {
        text: 'Soal relief di candi ini. Ceritanya tentang api dan cahaya gitu. Udah sampai bab tiga, terus kabut datang, terus… ya, aku masih di bab tiga.',
      },
      terang: {
        text: 'Judulnya "Narasi Cahaya pada Relief Candi Pesisir". Intinya, candi ini bukan cuma tempat ibadah, tapi semacam kunci — reliefnya ngajarin urutan nyalain pelita, kayak tutorial dari batu. Literally game design abad ke-9. Dosenku bilang terlalu "kreatif". Lihat aja nanti.',
        clue: { id: 'skripsi_laras', text: 'Menurut Laras, relief candi adalah petunjuk urutan menyalakan pelita — "tutorial dari batu".' },
      },
    },
    {
      id: 'kabut_teori',
      label: 'Teori kabut',
      ask: 'Menurutmu kabut ini apa?',
      kind: 'catatan',
      redup: {
        text: 'Teoriku: kabut ini literally awan yang capek terbang. Jadi dia rebahan. Di pulau kita. Relate banget, sih. Vibes-nya kayak hari Senin.',
      },
      sedang: {
        text: 'Kayaknya kabut ini nyambung sama kalimat di relief: "yang tak bertanya akan diselimuti". Tapi aku belum yakin itu metafora atau ramalan cuaca.',
      },
      terang: {
        text: 'Oke, teoriku: kabut ini brain fog satu pulau, tapi literal. Relief bilang "yang tak bertanya akan diselimuti", dan timeline-nya cocok sama cerita Mbah Sarni — orang berhenti bertanya, kabut datang. Jadi mercusuar itu literally "pikiran" pulau ini. Nyalain lagi, pulau mikir lagi. Gila, aku harus nulis ini sekarang.',
        clue: { id: 'kabut_teori', text: 'Teori Laras: mercusuar adalah "pikiran" pulau. Menyalakannya lagi membuat pulau bertanya lagi.' },
      },
    },
  ],
};
