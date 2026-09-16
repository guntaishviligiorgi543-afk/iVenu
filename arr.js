const bands = [
  {
    id: 1,
    bandName: "Imagine Dragons",
    bandImage:
      "https://chuffmedia.com/images/artists/ID_031224_05_0724-reto.jpg",
    bandDescription: `
      Imagine Dragons is one of the most influential alternative rock bands
      of the modern era. Known for their powerful live performances,
      emotional lyrics and global hits, the band has built a massive
      international fanbase and performed at some of the world's biggest
      music festivals and arenas.
    `,

    event: {
      title: "Imagine Dragons — Live in Georgia",

      description: `
        Experience Imagine Dragons live in an unforgettable night of music,
        lights and spectacular production. The band will perform their
        biggest international hits together with songs from their latest
        releases in one of Georgia's largest concert venues.
      `,

      date: "2026-08-30",

      time: "21:00",

      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 80,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 150,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 300,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Dinamo Arena",

      address: "2 Akaki Tsereteli Ave, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Dinamo+Arena+Tbilisi",

      coordinates: {
        lat: 41.7239,
        lng: 44.7888,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkpY6CiGhlJSUm5OxRCSjXhwCz23bp-WsBREo33xafONrJJQerAnRj1GVG&s=10",
  },

  {
    id: 2,

    bandName: "The Killers",

    bandImage:
      "https://i.scdn.co/image/ab6761610000e5eb207b21f3ed0ee96adce3166a",

    bandDescription: `
      The Killers are an internationally acclaimed rock band known for
      their energetic performances, distinctive sound and timeless hits.
      Their music combines alternative rock, indie rock and electronic
      influences, making their live shows a major experience for fans
      around the world.
    `,

    event: {
      title: "The Killers — Live at Black Sea Arena",

      description: `
        Get ready for a spectacular night on the Black Sea coast.
        The Killers will bring their legendary live performance to Georgia,
        featuring their biggest songs, immersive lighting and a massive
        concert production.
      `,

      date: "2026-08-15",

      time: "21:30",

      doorsOpen: "18:30",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 100,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 180,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 350,
        currency: "₾",
      },
    },

    location: {
      city: "Shekvetili",

      venue: "Black Sea Arena",

      address: "Shekvetili, Guria, Georgia",

      map: "https://maps.google.com/?q=Black+Sea+Arena+Shekvetili",

      coordinates: {
        lat: 41.9256,
        lng: 41.9355,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCj5gKXw46nytpQRAYakOC6K0hSwCY5ZGvR7aRssJMlWhCDVGCY_eQ1Jg7&s=10",
  },

  {
    id: 3,

    bandName: "OneRepublic",

    bandImage:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRGvAb2E2BlVLbDCwjV_8Sq3MAewtrem91vUkwkeA1yFg&s=10",

    bandDescription: `
      OneRepublic is an American pop rock band recognized for their
      emotional songwriting, powerful vocals and international chart-topping
      songs. The band's music combines pop, rock and electronic elements,
      creating a unique sound that has attracted millions of listeners
      worldwide.
    `,

    event: {
      title: "OneRepublic — Live in Georgia",

      description: `
        OneRepublic arrives in Georgia for a spectacular live concert.
        Fans will experience an evening filled with powerful vocals,
        unforgettable melodies and the band's biggest worldwide hits.
      `,

      date: "2026-05-10",

      time: "21:00",

      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 70,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 140,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 280,
        currency: "₾",
      },
    },

    location: {
      city: "Shekvetili",

      venue: "Black Sea Arena",

      address: "Shekvetili, Guria, Georgia",

      map: "https://maps.google.com/?q=Black+Sea+Arena+Shekvetili",

      coordinates: {
        lat: 41.9256,
        lng: 41.9355,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSBtcyQpVtYZbVlJDikktTLXNOkFtZsbUSTMz4U-QdQmg&s=10",
  },
  {
    id: 4,

    bandName: "Coldplay",

    bandImage:
      " https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTLkwT1Lj3HwOXDhWdh2FMHJnsN7WB_ab4nuo4ueGHfypL7STxgzed06UD_&s=10",

    bandDescription: `
      Coldplay is one of the world's most successful alternative rock bands,
      famous for their spectacular live performances, emotional songs and
      unforgettable visual productions.
    `,

    event: {
      title: "Coldplay — Live in Georgia",

      description: `
        Coldplay brings an extraordinary concert experience to Georgia,
        featuring their biggest hits, spectacular lights and an unforgettable
        atmosphere for thousands of fans.
      `,

      date: "2026-09-12",

      time: "21:00",

      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 90,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 180,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 350,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Dinamo Arena",

      address: "2 Akaki Tsereteli Ave, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Dinamo+Arena+Tbilisi",

      coordinates: {
        lat: 41.7239,
        lng: 44.7888,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSA5GSzvp0C3jpIXEvS4MF8EWycdhuweBDO5ASnAisJi682fQu2pAYxO-_k&s=10",
  },

  {
    id: 5,

    bandName: "Arctic Monkeys",

    bandImage:
      " https://i.scdn.co/image/ab6761610000e5eb7da39dea0a72f581535fb11f",

    bandDescription: `
      Arctic Monkeys are an English rock band known for their distinctive
      sound, powerful guitar riffs and energetic performances.
    `,

    event: {
      title: "Arctic Monkeys — Live in Georgia",

      description: `
        Experience Arctic Monkeys live in an unforgettable evening featuring
        their biggest alternative rock hits and a spectacular concert setup.
      `,

      date: "2026-09-20",

      time: "20:30",

      doorsOpen: "17:30",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 80,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 160,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 320,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Tbilisi Concert Hall",

      address: "1 Kostava St, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Tbilisi+Concert+Hall",

      coordinates: {
        lat: 41.7036,
        lng: 44.7925,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_XME-3sZqcOr_80izVpd93iqJM6AloTBsOnXAXrupoA&s=10",
  },

  {
    id: 6,

    bandName: "Linkin Park",

    bandImage:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSYONe-JPoyDx4uwKnjgSLLsIC7S8jxndch1EYJuxicjUMidAiQRi8d7oo&s=10",

    bandDescription: `
      Linkin Park is one of the most influential rock bands of the modern
      era, combining alternative rock, electronic music and powerful vocals.
    `,

    event: {
      title: "Linkin Park — Live in Georgia",

      description: `
        A massive rock concert featuring Linkin Park's iconic songs,
        powerful production and an unforgettable live atmosphere.
      `,

      date: "2026-10-03",

      time: "21:00",

      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 85,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 170,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 330,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Dinamo Arena",

      address: "2 Akaki Tsereteli Ave, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Dinamo+Arena+Tbilisi",

      coordinates: {
        lat: 41.7239,
        lng: 44.7888,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRh1KSurxJEN8Dza0E3jKNBDUMYsBUmihGy1_DHJcp7RTIijh3dbJru_ysM&s=10",
  },

  {
    id: 7,

    bandName: "Muse",

    bandImage:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTxKBNUcAFCJv3CQhM8d3wK4l-iNAD8wpqdJEysZ5nUIA&s=10",

    bandDescription: `
      Muse are an English rock band recognized for their dramatic sound,
      powerful instrumentation and spectacular stadium performances.
    `,

    event: {
      title: "Muse — Live in Georgia",

      description: `
        Muse will deliver a spectacular night of alternative rock with
        powerful performances, immersive visuals and their biggest hits.
      `,

      date: "2026-10-18",

      time: "21:30",

      doorsOpen: "18:30",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 90,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 190,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 360,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Dinamo Arena",

      address: "2 Akaki Tsereteli Ave, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Dinamo+Arena+Tbilisi",

      coordinates: {
        lat: 41.7239,
        lng: 44.7888,
      },
    },
    bandImg2:
      "https://img.cooplive.com/5ojmf2bIu0PI42GdTogPKFkMh0OgFigGVtuuM4TIoEg/c:2426:1364:fp:0.5:0.33/s:1920:1080:1/aHR0cHM6Ly93d3cuY29vcGxpdmUuY29tLy9jbXNfZmlsZXMvc3lzdGVtL2ltYWdlcy9pbWczNzQyX29yaWcuanBn",
  },

  {
    id: 8,

    bandName: "Nirvana",

    bandImage:
      "https://www.impericon.com/cdn/shop/articles/20230912_nirvanajubilaeum_2_52c5ec1e-4a78-4f5a-b5f3-3b054e9cc10c.jpg?v=1740047327",

    bandDescription: `
    Nirvana was one of the most influential rock bands of the 1990s,
    known for their raw sound, powerful performances and major influence
    on the grunge and alternative rock scene.
  `,

    event: {
      title: "Nirvana — Live in Georgia",

      description: `
      Experience an unforgettable night of grunge and alternative rock,
      featuring Nirvana's most iconic songs and a powerful live atmosphere.
    `,

      date: "2026-11-01",

      time: "20:00",

      doorsOpen: "17:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 75,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 150,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 300,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Olympic Palace",

      address: "University Street, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Olympic+Palace+Tbilisi",

      coordinates: {
        lat: 41.7151,
        lng: 44.7396,
      },
    },
    bandImg2:
      "https://static.independent.co.uk/s3fs-public/thumbnails/image/2013/09/19/17/nirvana.jpg",
  },
  {
    id: 9,

    bandName: "Foo Fighters",

    bandImage:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTFumryTkx_2jP_Vod2qEUYfaY5wsMQz2-67YC40LSSEHZdvaUofVBREheq&s=10",

    bandDescription: `
      Foo Fighters are an iconic American rock band known for their energetic
      live performances, powerful guitar sound and legendary rock anthems.
    `,

    event: {
      title: "Foo Fighters — Live in Georgia",

      description: `
        Get ready for a massive rock show featuring Foo Fighters' biggest
        songs, powerful guitars and an unforgettable live performance.
      `,

      date: "2026-11-14",

      time: "21:00",

      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 85,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 175,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 340,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Dinamo Arena",

      address: "2 Akaki Tsereteli Ave, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Dinamo+Arena+Tbilisi",

      coordinates: {
        lat: 41.7239,
        lng: 44.7888,
      },
    },
    bandImg2:
      "https://guitar.com/wp-content/uploads/2019/02/foo-fighters-dave-grohl@1400x1050-scaled.jpg",
  },

  {
    id: 10,

    bandName: "The Weeknd",

    bandImage:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRZka76z7-djUz7KSdGLaa-1MQD4dhwFv_FjpzsTkT3uA&s=10",

    bandDescription: `
      The Weeknd is one of the world's most successful contemporary artists,
      combining pop, R&B and electronic influences with cinematic live shows.
    `,

    event: {
      title: "The Weeknd — Live in Georgia",

      description: `
        Experience an unforgettable night with The Weeknd featuring his
        biggest global hits, immersive lighting and spectacular production.
      `,

      date: "2026-12-05",

      time: "21:00",

      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 100,
        currency: "₾",
      },

      medium: {
        name: "medium",
        price: 200,
        currency: "₾",
      },

      vip: {
        name: "VIP",
        price: 400,
        currency: "₾",
      },
    },

    location: {
      city: "Tbilisi",

      venue: "Dinamo Arena",

      address: "2 Akaki Tsereteli Ave, Tbilisi, Georgia",

      map: "https://maps.google.com/?q=Dinamo+Arena+Tbilisi",

      coordinates: {
        lat: 41.7239,
        lng: 44.7888,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQP3nLNZttCHnzPjTH1Fb2H8K9ZlQtvblGeCQvtY24SNj_cxKL6uyTWKztT&s=10",
  },
  {
    id: 11,
    bandName: "The Generators",
    bandImage:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSnhjHq08RifX-zvqNs4JyuCDCevmVUSJqdKkqdLFUBYq4-cr6oZbzakk0G&s=10",
    bandDescription: "The Generators live performance.",

    event: {
      title: "The Generators — Live in Georgia",
      description:
        "Experience The Generators live in an unforgettable night of music.",
      date: "2026-04-04",
      time: "19:00",
      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 80,
        currency: "₾",
      },
      medium: {
        name: "medium",
        price: 150,
        currency: "₾",
      },
      vip: {
        name: "VIP",
        price: 300,
        currency: "₾",
      },
    },

    location: {
      city: "San Francisco",
      venue: "Goldcountry",
      address: "San Francisco, CA",
      map: "",
      coordinates: {
        lat: 0,
        lng: 0,
      },
    },
    bandImg2:
      "https://static.wixstatic.com/media/ea71bb_7122ae50f1d94e319a672f70ee15c02f~mv2_d_6000_4000_s_4_2.jpg/v1/fill/w_1225,h_716,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/ea71bb_7122ae50f1d94e319a672f70ee15c02f~mv2_d_6000_4000_s_4_2.jpg",
  },

  {
    id: 12,
    bandName: "Badlands Bound",
    bandImage:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSwUKxXwewmY36j8hGb1cgE01Q2AmlfoerS1FJL0nu_Cw&s",
    bandDescription: "Balands Bound live performance.",

    event: {
      title: "Balands Bound — Live in Georgia",
      description:
        "Experience Balands Bound live in an unforgettable night of music.",
      date: "2026-04-05",
      time: "20:00",
      doorsOpen: "18:30",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 80,
        currency: "₾",
      },
      medium: {
        name: "medium",
        price: 150,
        currency: "₾",
      },
      vip: {
        name: "VIP",
        price: 300,
        currency: "₾",
      },
    },

    location: {
      city: "San Francisco",
      venue: "Black Sea Arena",
      address: "San Francisco, CA",
      map: "",
      coordinates: {
        lat: 0,
        lng: 0,
      },
    },
    bandImg2:
      "https://static.wixstatic.com/media/ea71bb_8dc1b4d1d3204d5fb55e333b736ffe2e~mv2_d_5600_3738_s_4_2.jpg/v1/fill/w_640,h_360,fp_0.50_0.50,q_80,usm_0.66_1.00_0.01,enc_auto/ea71bb_8dc1b4d1d3204d5fb55e333b736ffe2e~mv2_d_5600_3738_s_4_2.jpg",
  },

  {
    id: 13,
    bandName: "Smoking Gun",
    bandImage:
      "https://static.wixstatic.com/media/ea71bb_60599895bdbe4dd182196074e555d5d8~mv2_d_5171_1640_s_2.jpg/v1/fill/w_1901,h_716,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/ea71bb_60599895bdbe4dd182196074e555d5d8~mv2_d_5171_1640_s_2.jpg",
    bandDescription: "Smoking Gun live performance.",

    event: {
      title: "Smoking Gun — Live in Georgia",
      description:
        "Experience Smoking Gun live in an unforgettable night of music.",
      date: "2026-04-07",
      time: "20:00",
      doorsOpen: "18:00",
    },

    tickets: {
      cheap: {
        name: "Standard",
        price: 80,
        currency: "₾",
      },
      medium: {
        name: "medium",
        price: 150,
        currency: "₾",
      },
      vip: {
        name: "VIP",
        price: 300,
        currency: "₾",
      },
    },

    location: {
      city: "San Francisco",
      venue: "Stonesmith",
      address: "San Francisco, CA",
      map: "",
      coordinates: {
        lat: 0,
        lng: 0,
      },
    },
    bandImg2:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3e7GG44ZNexUIVTDicQ8sTkyuWBEVyh6xXEnp7q-17-Z_S3s-fDE_kw0&s=10",
  },
];
 