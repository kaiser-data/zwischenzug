window.PATH_SESSIONS = {
  "2xz7ugnc": {
    "id": "2xz7ugnc",
    "url": "https://lichess.org/2xz7ugnc",
    "player": "nico",
    "title": "Caf\u00e9 game vs Martin \u00b7 you White \u00b7 London vs St. George",
    "date": "2026-10-30 18:00",
    "result": "0-1",
    "event": "Slow game in a caf\u00e9 \u00b7 Nico (White) vs Martin (Black, FIDE 2171) \u00b7 mated on move 31",
    "startFen": "r2qkb1r/1bpnppp1/p2p3p/1p6/3P4/2PBPNP1/PP1N1PP1/R2QK2R w KQkq - 0 10",
    "logNote": "Nico's game: three set-up moments (a4 against b5, castle before Rh5, keep c3 covered) and three tactics in the side lines (the check that saves a piece, the rook trap, pin first then take). By 22.Bg6 the game was already lost.",
    "steps": [
      {
        "id": "lever",
        "name": "1 Set-up: a4",
        "title": "Move 10 \u00b7 White to move \u00b7 Black's pawn on b5 sticks out",
        "prompt": "Your pieces are out (Bf4\u2013g3, e3, c3, Bd3, Nbd2, Nf3). Now look at Black's pawn on b5: it stands far forward. Which of your pawns can attack it?",
        "fen": "r2qkb1r/1bpnppp1/p2p3p/1p6/3P4/2PBPNP1/PP1N1PP1/R2QK2R w KQkq - 0 10",
        "questions": [
          {
            "name": "gain",
            "type": "select",
            "label": "1.1 After 10.a4 c6, Black holds b5. What did a4 still get you?",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "both",
                "label": "c6 blocks the b7 bishop, and the a-file opens for my rook"
              },
              {
                "value": "pawn",
                "label": "a pawn"
              },
              {
                "value": "nothing",
                "label": "nothing"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "a4",
            "label": "10.a4",
            "write": true,
            "given": 0,
            "ask": "your pawn move against b5",
            "mustPlay": [
              "a4"
            ],
            "alts": [
              [
                "c4"
              ]
            ],
            "key": "<p class='ok'><b>10.a4!</b> A pawn that sticks out is attacked with a pawn. The engine wanted a4 on moves 5, 6, 7, 8, 10 and 11. (10.c4 does the same job from the other side.) In the game you played 10.Qc2, and the b5 pawn later marched on with \u2026b4 towards your king.</p>"
          },
          {
            "id": "c6",
            "label": "10.a4 c6 \u00b7 Black holds b5",
            "mustPlay": [
              "a4",
              "c6",
              "axb5",
              "axb5",
              "O-O",
              "e6",
              "Qb3"
            ],
            "key": "<p class='ok'><b>10\u2026c6</b> is Black's best answer: b5 is held. But look what it cost. The bishop on b7 now looks into its own pawn on c6, and after 11.axb5 axb5 your rook on a1 has an open file. The plan is simple: castle, 13.Qb3 at b5, then c4 to hit it again. White is a little better, without risking anything.</p>"
          }
        ],
        "key": "<p><b>Set-up idea:</b> In the London (d4, Bf4, e3, c3, Bd3, Nbd2, Nf3) your pieces are out by move 8. Then ask: <i>which Black pawn can my pawns attack?</i> Here: b5, with a4. Even when Black defends it, he has to put a pawn where it gets in his own way.</p>"
      },
      {
        "id": "king",
        "name": "2 Set-up: king first",
        "title": "Move 13 \u00b7 White to move \u00b7 your king is still on e1",
        "prompt": "Black just played \u2026c5, so the c-file will open soon. Your rook on h1 has an open h-file. Find the move that makes your position safe. In the game you played 13.Rh5.",
        "fen": "r2qkb1r/1b1n1pp1/p3p2p/1ppp4/3P4/2PBPNP1/PPQN1PP1/R3K2R w KQkq - 0 13",
        "questions": [
          {
            "name": "rook",
            "label": "2.1 What does the rook on h5 attack after 13.Rh5?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "nothing",
                "label": "nothing: d5 is guarded twice"
              },
              {
                "value": "d5",
                "label": "the d5 pawn"
              },
              {
                "value": "king",
                "label": "Black's king"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "castle",
            "label": "13.O-O",
            "write": true,
            "given": 0,
            "ask": "make your king safe",
            "mustPlay": [
              "O-O"
            ],
            "alts": [
              [
                "e4"
              ]
            ],
            "key": "<p class='ok'><b>13.O-O</b>. The king leaves e1 before the c-file opens. (13.e4, hitting the centre at once, is just as good; castle next move.) After 13.Rh5 the rook went h5, e5, h5 in three moves and won nothing. Meanwhile the king stayed on e1, and on move 19 that cost you the c3 pawn (step 6).</p>"
          },
          {
            "id": "long",
            "label": "13.O-O-O? c4 14.Be2 b4 \u00b7 the wrong side",
            "mustPlay": [
              "O-O-O",
              "c4",
              "Be2",
              "b4"
            ],
            "key": "<p class='ok'><b>13.O-O-O?</b> Castling into Black's pawns: \u2026c4 and \u2026b4 come with gain of time, and the c-file opens towards c1. Castle on the side where the opponent's pawns are <i>not</i> already marching.</p>"
          }
        ],
        "key": "<p><b>Set-up idea:</b> When your pieces are out, the king goes home <i>before</i> the centre opens. A rook move that attacks nothing is not activity, it is a lost move: Black can answer every Rh5 with a useful move of his own.</p>"
      },
      {
        "id": "retake",
        "name": "3 Tactic: take back",
        "title": "After 14\u2026Nxe5 \u00b7 White to move \u00b7 four ways to take back",
        "prompt": "Black took on e5. You can take back with the pawn (dxe5) or the rook (Rxe5), or take on c5 first (dxc5). Only one keeps the game level. Find it, then find Black's answer to the other two: each one hides a tactic.",
        "fen": "2rqkb1r/1b3pp1/p3p2p/1pppn2R/3P4/2PBP1P1/PPQN1PP1/R3K3 w Qk - 0 15",
        "questions": [],
        "branches": [
          {
            "id": "dxe5",
            "label": "15.dxe5",
            "write": true,
            "given": 0,
            "ask": "the safe recapture",
            "mustPlay": [
              "dxe5"
            ],
            "key": "<p class='ok'><b>15.dxe5</b>. Pawn takes, the rook stays free, and the e5 pawn takes the d6 and f6 squares away from Black's pieces. The game stays close to level.</p>"
          },
          {
            "id": "dxc5",
            "label": "15.dxc5?",
            "write": true,
            "given": 1,
            "ask": "Black's in-between move",
            "mustPlay": [
              "dxc5",
              "Nxd3+",
              "Qxd3"
            ],
            "key": "<p class='ok'><b>15.dxc5? Nxd3+! 16.Qxd3</b>. Black's knight on e5 has just taken your knight, and now only your rook attacks it. Instead of running away, it takes your bishop <i>with check</i>. That is a <b>zwischenzug</b> (in-between move): 16.Qxd3 only takes back for the bishop. The knight you lost on e5 never comes back: a whole piece for a pawn. Before you take, ask: <i>can the attacked piece capture something with check?</i></p>"
          },
          {
            "id": "rxe5",
            "label": "15.Rxe5 (game)",
            "write": true,
            "given": 1,
            "ask": "Black's strongest reply (not the game's 15\u2026Bd6)",
            "mustPlay": [
              "Rxe5",
              "g5"
            ],
            "alts": [
              [
                "Rxe5",
                "c4"
              ]
            ],
            "key": "<p class='ok'><b>15.Rxe5 g5!</b>. Your rook is stuck in front of Black's pawns: e4, d5 and f5 are covered by the d5 and e6 pawns, and g5 is now a pawn guarded by h6. Next comes \u2026Bg7 and the rook is lost for a bishop. (15\u2026c4, chasing your bishop first, wins too.) Black played 15\u2026Bd6 and let you out. Step 4 shows the trap in full.</p>"
          }
        ],
        "key": "<p><b>Tactic habit:</b> When you have several captures, look at Black's best answer to <i>each</i> one before you pick. Here one loses a piece at once, and the natural-looking one walks into a trap.</p>"
      },
      {
        "id": "trap",
        "name": "4 Tactic: rook trap",
        "title": "After 15.Rxe5 \u00b7 Black to move \u00b7 catch the rook",
        "prompt": "Now you are Black. The white rook on e5 looks active. Find the pawn move that leaves it with no safe square, then play the trap to the end.",
        "fen": "2rqkb1r/1b3pp1/p3p2p/1pppR3/3P4/2PBP1P1/PPQN1PP1/R3K3 b Qk - 0 15",
        "questions": [
          {
            "name": "squares",
            "label": "4.1 After 15\u2026g5, how many safe squares does the rook on e5 have?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "0",
                "label": "none"
              },
              {
                "value": "1",
                "label": "one"
              },
              {
                "value": "2",
                "label": "two or more"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "g5",
            "label": "15\u2026g5",
            "write": true,
            "given": 0,
            "ask": "the pawn move that cages the rook",
            "mustPlay": [
              "g5"
            ],
            "alts": [
              [
                "c4"
              ]
            ],
            "key": "<p class='ok'><b>15\u2026g5!</b>. Rf5 runs into \u2026exf5, Re4 into \u2026dxe4, Rxd5 into \u2026exd5, Rxg5 into \u2026hxg5, Rxe6+ into \u2026fxe6. No safe square. (15\u2026c4 also wins material, by kicking the bishop first.)</p>"
          },
          {
            "id": "trap-line",
            "label": "15\u2026g5 16.f4 Bg7 17.Nf3 g4 18.Nh4 Bxe5 19.dxe5 \u00b7 the trap closes",
            "mustPlay": [
              "g5",
              "f4",
              "Bg7",
              "Nf3",
              "g4",
              "Nh4",
              "Bxe5",
              "dxe5"
            ],
            "key": "<p class='ok'>16.f4 tries to back the rook up, but \u2026Bg7 hits it a second time and \u2026g4 drives the knight away. Rook for bishop: Black is up the exchange.</p>"
          }
        ],
        "key": "<p><b>Tactic pattern: the trapped piece.</b> A rook or bishop that goes deep into the opponent's pawns can run out of squares. Before you put a piece there, count its ways back. On e5 the answer was: none.</p>"
      },
      {
        "id": "cover",
        "name": "5 Set-up: cover c3",
        "title": "Move 18 \u00b7 White to move \u00b7 take back on d4",
        "prompt": "Black played \u2026b4 and \u2026cxd4. Your king is still on e1, and your c3 pawn will soon stand alone. Choose the recapture that keeps a piece near c3. Then play what happened in the game.",
        "fen": "2rqk2r/1b3pp1/p2bp2p/3p3R/1p1p4/2PBPNP1/PPQ2PP1/R3K3 w Qk - 0 18",
        "questions": [
          {
            "name": "weak",
            "label": "5.1 After \u2026bxc3 bxc3, which white pawn is the target?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "c3",
                "label": "c3: alone on the open c-file"
              },
              {
                "value": "d4",
                "label": "d4"
              },
              {
                "value": "a2",
                "label": "a2"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "nxd4",
            "label": "18.Nxd4",
            "write": true,
            "given": 0,
            "ask": "the recapture that keeps c3 covered",
            "mustPlay": [
              "Nxd4"
            ],
            "key": "<p class='ok'><b>18.Nxd4</b>. The knight can go to e2 and guard c3 (18\u2026bxc3 19.bxc3 Qa5 20.Ne2). Black is still better, but nothing falls.</p>"
          },
          {
            "id": "game",
            "label": "18.exd4 bxc3 19.bxc3 Qa5 (game)",
            "mustPlay": [
              "exd4",
              "bxc3",
              "bxc3",
              "Qa5"
            ],
            "key": "<p class='ok'><b>18.exd4 bxc3 19.bxc3 Qa5</b>. c3 is now attacked by the queen and the c8 rook, and no knight can reach e2 to help. Step 6 shows why you can't simply defend it: the pawn is pinned.</p>"
          }
        ],
        "key": "<p><b>Set-up idea:</b> When the opponent opens a file towards your uncastled king, recapture so that a piece stays next to your weak pawn. Pawns protect best from behind; pieces protect best from close by.</p>"
      },
      {
        "id": "pin",
        "name": "6 Tactic: pin first",
        "title": "After 19.bxc3 \u00b7 Black to move \u00b7 win the c3 pawn",
        "prompt": "You are Black again. The c3 pawn is attacked once (Rc8) and guarded once (Qc2). Rxc3 now drops the rook. Find the queen move that makes c3 fall anyway, and see why the order matters.",
        "fen": "2rqk2r/1b3pp1/p2bp2p/3p3R/3P4/2PB1NP1/P1Q2PP1/R3K3 b Qk - 0 19",
        "questions": [
          {
            "name": "pinned",
            "label": "6.1 After 19\u2026Qa5, why can't White hold c3 with Qxc3 later?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "pin",
                "label": "c3 is pinned: the queen on a5 looks through c3 to the king on e1"
              },
              {
                "value": "count",
                "label": "Black has more attackers"
              },
              {
                "value": "time",
                "label": "no time"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "qa5",
            "label": "19\u2026Qa5",
            "write": true,
            "given": 0,
            "ask": "the pin",
            "mustPlay": [
              "Qa5"
            ],
            "key": "<p class='ok'><b>19\u2026Qa5!</b>. The diagonal a5\u2013b4\u2013c3\u2013d2\u2013e1 ends at your king. c3 is attacked twice now. Black played it in the game.</p>"
          },
          {
            "id": "wrong-order",
            "label": "19\u2026Rxc3? 20.Qxc3 \u00b7 the wrong order",
            "mustPlay": [
              "Rxc3",
              "Qxc3"
            ],
            "key": "<p class='ok'><b>19\u2026Rxc3? 20.Qxc3</b>. One attacker, one defender: the rook is gone. Same pawn, same capture, one move too early.</p>"
          },
          {
            "id": "then-take",
            "label": "19\u2026Qa5 20.Ke2 Rxc3 \u00b7 then take (game)",
            "mustPlay": [
              "Qa5",
              "Ke2",
              "Rxc3"
            ],
            "key": "<p class='ok'><b>20.Ke2 Rxc3</b>. The king stepped out of the pin, but c3 still falls: two attackers against one defender. (20.Qd2 Rxc3 is the same.) From here Black was clearly winning, and by 22.Bg6 the game was lost.</p>"
          }
        ],
        "key": "<p><b>Tactic pattern: the pin.</b> A king on its starting square stands at the end of two diagonals (a5\u2013e1 and h4\u2013e1). Every piece in front of it on those lines can be pinned. Castling (step 2) removes the problem before it starts.</p>"
      },
      {
        "id": "takeaways",
        "name": "7 Your three habits",
        "title": "What to take into the next game",
        "prompt": "Six moments, two kinds of lesson. Pick the habit you will use first. There is no wrong answer, it is for you.",
        "fen": "2rqk2r/1b3pp1/p2bp2p/3p3R/3P4/2PB1NP1/P1Q2PP1/R3K3 b Qk - 0 19",
        "mustPlay": [],
        "questions": [
          {
            "name": "habit",
            "label": "7.1 Which habit first?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "castle",
                "label": "Castle before the centre opens"
              },
              {
                "value": "answers",
                "label": "Before every capture: Black's best answer, with checks first"
              },
              {
                "value": "count",
                "label": "Count attackers and defenders before I take"
              }
            ]
          }
        ],
        "key": "<p><b>Set-up:</b> pieces out, then a pawn lever (a4 against b5), then castle. Do it <i>before</i> moves like Rh5.</p><p><b>Tactics:</b> before any capture, look at the opponent's checks and captures in reply: Nxd3+ (zwischenzug), \u2026g5 (trapped rook), \u2026Qa5 (pin). All three were one move away from you, and all three are common.</p><p><b>Next:</b> open <b>Training</b> in the game list. Every day you get a few positions from real Lichess games near your rating. Write the whole line, both sides, until nothing more is taken, then Lock.</p>"
      }
    ]
  },
  "6yfxgu80": {
    "id": "6yfxgu80",
    "url": "https://lichess.org/6yfxgu80",
    "title": "Classical vs Hannebauer \u00b7 you White \u00b7 French Winawer, exchange",
    "date": "2026-09-27 10:00",
    "result": "1-0",
    "event": "Classical OTB \u00b7 Oweide \u00b7 vs Torsten Hannebauer (DWZ ~1950) \u00b7 resigned after 20.Ng3+",
    "category": "clean",
    "startFen": "r1q1k2r/pp1n1ppp/3Bb3/1Bnp4/8/2P5/P1P1NPPP/R2Q1RK1 w kq - 2 13",
    "logNote": "Clean: 13.Qd4! the only knockout after 12\u2026Nfd7?; saw it to Qxg7/Qxh8+, not to 16\u2026Rxc8. Resigned after 20.Ng3+.",
    "steps": [
      {
        "id": "opening",
        "name": "1 Opening",
        "title": "After 7\u2026Be6 \u00b7 where the edge came from",
        "prompt": "Replay your moves 8\u201310 on the board. Then decide which Black move gave you the most \u2014 not which of yours was clever.",
        "fen": "rn1qk1nr/pp3ppp/4b3/2Pp4/8/2PB4/P1P2PPP/R1BQK1NR w KQkq - 1 8",
        "mustPlay": [
          "Ne2",
          "Nf6",
          "Bf4",
          "Nbd7",
          "Bd6"
        ],
        "questions": [
          {
            "name": "material",
            "label": "1.1 Material after 7\u2026Be6",
            "hint": "Count c5.",
            "type": "text"
          },
          {
            "name": "concession",
            "label": "1.2 Which Black move cost the most in the opening?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "c5",
                "label": "5\u2026c5"
              },
              {
                "value": "bxc3",
                "label": "6\u2026Bxc3+"
              },
              {
                "value": "be6",
                "label": "7\u2026Be6"
              },
              {
                "value": "same",
                "label": "about the same size"
              }
            ]
          },
          {
            "name": "bd6",
            "label": "1.3 What does 10.Bd6 take away from Black \u2014 and which later move needs exactly that?",
            "type": "textarea"
          }
        ],
        "key": "<p><b>Material:</b> a pawn up. The c5 pawn is still yours, and Black has given up the dark-squared bishop for your knight.</p><p><b>Concessions:</b> 6\u2026Bxc3+ and 7\u2026Be6 each cost Black about half a pawn \u2014 the same size. 6\u2026Nc6 or 6\u2026Nf6 would have won c5 back quietly; after the trade on c3 Black owns no dark bishop, and 7\u2026Be6 (instead of 7\u2026Nf6) still leaves c5 alone. 5\u2026c5 itself was nothing.</p><p><b>Your side:</b> nothing to find. 8.Ne2, 8.Nf3 and 8.Rb1 are the same size; 9.Bf4 is a hair behind 9.O-O and it does not matter. 4.exd5 is the same quiet choice as in game 2 (XbhWoWMi) \u2014 the extra did not come from move 4, it came from Black's moves 6 and 7.</p><p><b>10.Bd6</b> keeps the king in the centre. That is the move that makes 13.Qd4 work: g7 and h8 hang together only because the rook is still on h8.</p>"
      },
      {
        "id": "knockout",
        "name": "2 To the last capture",
        "type": "solve",
        "title": "After 12\u2026Nfd7 \u00b7 White to move",
        "prompt": "At the board you saw Qd4 and the hit on g7, and stopped at Qxg7 / Qxh8+. Write the line to the last capture, both sides. Then say what is left.",
        "fen": "r1q1k2r/pp1n1ppp/3Bb3/1Bnp4/8/2P5/P1P1NPPP/R2Q1RK1 w kq - 2 13",
        "solve": {
          "line": [
            "Qd4",
            "Ne4",
            "Qxg7",
            "Nxd6",
            "Qxh8+",
            "Ke7",
            "Qxc8",
            "Rxc8"
          ]
        },
        "questions": [
          {
            "name": "left",
            "label": "2.1 Material after the last capture",
            "type": "text"
          }
        ],
        "key": "<p>13.Qd4 Ne4 14.Qxg7 Nxd6 15.Qxh8+ Ke7 16.Qxc8 Rxc8 \u2014 eight ply, and the count is only true at the end: you give the d6 bishop and get the h8 rook and g7. <b>An exchange and a pawn up</b> with a queenless board.</p><p>It was enough this time because every stop along the way was already winning. That is luck in the method, not in the result: in XbhWoWMi the same stop (at your own capture) cost the game. Count to \u2026Rxc8.</p><p><b>Faster?</b> No. 13.Qd4 was the only move that ends it at once \u2014 13.c4, 13.Re1 and 13.Nf4 are good but give Black a game. From here Black resigned after 20.Ng3+.</p>"
      },
      {
        "id": "defence",
        "name": "3 His best tries",
        "title": "After 13.Qd4 \u00b7 Black to move \u00b7 his four tries",
        "prompt": "Three of his tries show only his moves \u2014 write your answer to the end, both sides, before you touch the board. The fourth you play through.",
        "fen": "r1q1k2r/pp1n1ppp/3Bb3/1Bnp4/3Q4/2P5/P1P1NPPP/R4RK1 b kq - 3 13",
        "questions": [
          {
            "name": "best",
            "label": "3.1 Which Black 13th move lasts longest?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "ne4",
                "label": "13\u2026Ne4 (game)"
              },
              {
                "value": "kd8",
                "label": "13\u2026Kd8"
              },
              {
                "value": "f6",
                "label": "13\u2026f6"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "desperado",
            "label": "Ne4 Qxg7 Qxc3 Nxc3 Nxd6 Qxh8+ Ke7 Qxa8",
            "mustPlay": [
              "Ne4",
              "Qxg7",
              "Qxc3",
              "Nxc3",
              "Nxd6",
              "Qxh8+",
              "Ke7",
              "Qxa8"
            ],
            "key": "<p class='ok'>The zwischenzug for Black: 14\u2026Qxc3 grabs a pawn with tempo on a1. Take the queen \u2014 15.Nxc3 \u2014 and h8 and a8 both fall. The desperado costs Black the second rook as well.</p>",
            "write": true,
            "given": 3,
            "ask": "his in-between capture"
          },
          {
            "id": "mate",
            "label": "Ne4 Qxg7 Qc6 Qxh8+ Nf8 Bxc6+ bxc6 Qxf8+ Kd7 Qe7+ Kc8 Qc7#",
            "mustPlay": [
              "Ne4",
              "Qxg7",
              "Qc6",
              "Qxh8+",
              "Nf8",
              "Bxc6+",
              "bxc6",
              "Qxf8+",
              "Kd7",
              "Qe7+",
              "Kc8",
              "Qc7#"
            ],
            "key": "<p class='ok'>14\u2026Qc6 looks like a counter-attack on b5. It is mate: 15.Qxh8+ Nf8 16.Bxc6+ takes the queen with check, and the queen walks the king to c8. 14\u2026Nf6 and 14\u2026Kd8 are mate in two.</p>",
            "write": true,
            "given": 3,
            "ask": "looks like counterplay"
          },
          {
            "id": "kd8",
            "label": "Kd8 Qxg7 Re8 Nd4",
            "mustPlay": [
              "Kd8",
              "Qxg7",
              "Re8",
              "Nd4"
            ],
            "key": "<p class='ok'>The king steps off the pin, g7 falls anyway and Nd4 joins with Nxe6 and c4 in the air. Worse than the game.</p>"
          },
          {
            "id": "f6",
            "label": "f6 Bxc5",
            "mustPlay": [
              "f6",
              "Bxc5"
            ],
            "key": "<p class='ok'>13\u2026f6 guards g7, but the d7 knight is pinned by b5 and cannot retake: 14.Bxc5 (or 14.Qxc5 Qxc5 15.Bxc5) is simply a piece.</p>",
            "write": true,
            "given": 1,
            "ask": "guards g7",
            "alts": [
              [
                "f6",
                "Qxc5"
              ]
            ]
          }
        ],
        "key": "<p><b>13\u2026Ne4 was his best.</b> Every other move loses more or gets mated. The position after 12\u2026Nfd7 was lost, and you found the one move that shows it \u2014 the work left is counting it to the end before you play it.</p>"
      },
      {
        "id": "bestdef",
        "name": "4 If he had found Bd7",
        "title": "After 12.Bb5+ \u00b7 Black to move \u00b7 the defence he missed",
        "prompt": "12\u2026Nfd7 lost on the spot. Play 12\u2026Bd7 and White's best answer, then decide how much of the win was yours.",
        "fen": "r1q1k2r/pp3ppp/3Bbn2/1Bnp4/8/2P5/P1P1NPPP/R2Q1RK1 b kq - 1 12",
        "mustPlay": [
          "Bd7",
          "Bxd7+",
          "Kxd7",
          "Be5"
        ],
        "questions": [
          {
            "name": "lost",
            "label": "4.1 Which Black move lost the game?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "bxc3",
                "label": "6\u2026Bxc3+"
              },
              {
                "value": "be6",
                "label": "7\u2026Be6"
              },
              {
                "value": "qc8",
                "label": "10\u2026Qc8"
              },
              {
                "value": "nfd7",
                "label": "12\u2026Nfd7"
              }
            ]
          },
          {
            "name": "plan",
            "label": "4.2 After 13.Bxd7+ Kxd7 14.Be5 \u2014 Black's king stays in the middle. What is your plan for the next five moves?",
            "type": "textarea"
          }
        ],
        "key": "<p><b>12\u2026Bd7!</b> 13.Bxd7+ Kxd7 14.Be5 Nce4 15.Nf4 \u2014 White is clearly better (a bit more than two pawns' worth), the king on d7 has no home, d5 is weak, but there is no knockout. Your plan: Nf4 against d5, f3 to kick the e4 knight, then Qd4.</p><p><b>What lost:</b> 10\u2026Qc8 (10\u2026Rc8 was the move) made it hard, 12\u2026Nfd7 made it over. The game lasted 20 moves because Black blocked the check with the wrong piece, not because there was a faster win for you before that.</p>"
      },
      {
        "id": "log",
        "name": "5 Log",
        "title": "Tag the game by its lesson",
        "prompt": "A clean game still gets a tag. Pick what it teaches, not the result.",
        "fen": "r1q1k2r/pp1n1ppp/3Bb3/1Bnp4/8/2P5/P1P1NPPP/R2Q1RK1 w kq - 2 13",
        "mustPlay": [],
        "questions": [
          {
            "name": "stop",
            "label": "5.1 At 13.Qd4 you stopped at Qxg7 / Qxh8+. Why was that enough here, and when would it not be?",
            "type": "textarea"
          },
          {
            "name": "tag",
            "label": "5.2 Tag",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "clean",
                "label": "clean"
              },
              {
                "value": "calculation",
                "label": "calculation"
              },
              {
                "value": "conversion",
                "label": "conversion"
              },
              {
                "value": "opening",
                "label": "opening"
              },
              {
                "value": "time",
                "label": "time"
              }
            ]
          },
          {
            "name": "note",
            "label": "5.3 Log note",
            "type": "textarea"
          }
        ],
        "key": "<p>Tag <b>clean</b>. From move 6 on every White move was the engine's first choice or level with it; 13.Qd4 was the only knockout and you found it. The one thing to carry over: you found the move and then stopped counting at Qxh8+. The leak doesn't cost anything in a position that is already winning, and it costs the game when the position is level \u2014 so count to the last capture anyway.</p>"
      }
    ]
  },
  "JB2bQpWt": {
    "id": "JB2bQpWt",
    "url": "https://lichess.org/JB2bQpWt",
    "title": "15+10 \u00b7 you White \u00b7 Alapin",
    "date": "2026-09-12 18:31",
    "result": "1-0",
    "category": "leak",
    "event": "Lichess 15+10 vs justlik3that",
    "startFen": "r4rk1/p3ppbp/1p4p1/qB1bP3/8/7P/PB2QPP1/1R2R1K1 w - - 2 20",
    "logNote": "Stopped at a6; missed Bd7 Bxg2 e6. Red1 is pseudo-activity vs Rfd8.",
    "steps": [
      {
        "id": "threeply",
        "type": "stopPly",
        "name": "1 Three ply",
        "title": "After 19\u2026Qa5, White to move",
        "prompt": "You looked at 20.a4 and did not play it. Name the reply that stopped you, then keep going past it.",
        "fen": "r4rk1/p3ppbp/1p4p1/qB1bP3/8/7P/PB2QPP1/1R2R1K1 w - - 2 20",
        "stopPly": {
          "candidate": "a4",
          "scare": "a6",
          "continue": [
            "Bd7",
            "Bxg2",
            "e6"
          ],
          "mixups": [
            {
              "match": [
                "Bxg2"
              ],
              "line": [
                "a4",
                "Bxg2",
                "Kxg2"
              ],
              "key": "<p class='bad'>That skips 21.Bd7. Without \u2026a6 and Bd7 first, \u2026Bxg2 is just a loose capture: 21.Kxg2 and White is winning (~+5). Same capture, different position.</p>"
            },
            {
              "match": [
                "Bd7",
                "Bxg2",
                "Kxg2"
              ],
              "line": [
                "a4",
                "a6",
                "Bd7",
                "Bxg2",
                "Kxg2",
                "Qd5+"
              ],
              "key": "<p class='bad'>Recapture first and \u2026Qd5+ forks the king and d7. It stays roughly level, but you are the one scrambling. <b>22.e6</b> comes first \u2014 the in-between move this dossier is named after.</p>"
            }
          ]
        },
        "questions": [],
        "key": "<p class='ok'>\u2026a6 is ply 1, not the end. 21.Bd7 Bxg2 <b>22.e6!</b> and it is level. The reply you disliked was not a refutation.</p>"
      },
      {
        "id": "diagnose",
        "name": "2 Diagnose",
        "title": "After 19\u2026Qa5, White to move",
        "prompt": "Candidates only. Do not stop at the first reply you dislike.",
        "fen": "r4rk1/p3ppbp/1p4p1/qB1bP3/8/7P/PB2QPP1/1R2R1K1 w - - 2 20",
        "mustPlay": [],
        "questions": [
          {
            "name": "material",
            "label": "2.1 Material",
            "hint": "Who is up, and by how much?",
            "type": "text"
          },
          {
            "name": "why",
            "label": "2.2 Why did it feel worse?",
            "type": "textarea"
          },
          {
            "name": "c1",
            "label": "2.3 Three candidate moves",
            "type": "triple",
            "names": [
              "c1",
              "c2",
              "c3"
            ]
          }
        ],
        "key": "<p><b>Material:</b> Black a pawn up. The minus is also the queen on a5 and the bishops vs uncoordinated White.</p><p>If you stopped at <b>\u2026a6</b>, that is the leak. Next step is the line past a6 \u2014 not Red1.</p>"
      },
      {
        "id": "calculate",
        "name": "3 Calculate",
        "title": "Four lines. Same capture is not the same eval.",
        "prompt": "Three branches show only the first moves \u2014 write the rest before you touch the board (Enter checks it). The one marked ?? you play through. The step's key opens once all four are locked.",
        "fen": "r4rk1/p3ppbp/1p4p1/qB1bP3/8/7P/PB2QPP1/1R2R1K1 w - - 2 20",
        "questions": [
          {
            "name": "retreats",
            "label": "After 20.a4 a6, three legal squares that keep Bb5",
            "type": "triple",
            "names": [
              "sq1",
              "sq2",
              "sq3"
            ]
          },
          {
            "name": "zwischen",
            "label": "After 21\u2026Bxg2, e6 or Kxg2 \u2014 and why?",
            "hint": "Name the zwischenzug.",
            "type": "textarea"
          },
          {
            "name": "bd4q",
            "label": "Bd4 \u2026Qxa2 \u2014 is the queen trapped like in the game?",
            "type": "textarea"
          }
        ],
        "branches": [
          {
            "id": "main",
            "write": true,
            "given": 2,
            "ask": "the reply you disliked \u2014 go on",
            "alts": [
              [
                "a4",
                "a6",
                "Bc4"
              ],
              [
                "a4",
                "a6",
                "Bd3"
              ]
            ],
            "label": "a4 a6 Bd7 Bxg2 e6",
            "mustPlay": [
              "a4",
              "a6",
              "Bd7",
              "Bxg2",
              "e6"
            ],
            "key": "<p class='ok'>The skipped line. 21.Bd7 keeps the bishop (Bc4, Bd3 also). 21\u2026Bxg2 is the shot \u2014 not a reason to reject a4. <b>22.e6!</b> zwischenzug, do not recapture first. \u2248 equal.</p>"
          },
          {
            "id": "mixup",
            "label": "a4 Bxg2?? (no Bd7)",
            "mustPlay": [
              "a4",
              "Bxg2"
            ],
            "key": "<p class='bad'>Same capture, opposite eval. Without a6/Bd7, <b>21.Kxg2</b> and White is winning (~+5). Do not mix this with the Bd7 line.</p>"
          },
          {
            "id": "bd4",
            "write": true,
            "given": 1,
            "ask": "what does Black take?",
            "label": "Bd4 Qxa2",
            "mustPlay": [
              "Bd4",
              "Qxa2"
            ],
            "key": "<p class='bad'>Looks central, drops a2. Bishop left b2, so Ra1 does not trap the queen. ~\u22123.</p>"
          },
          {
            "id": "red1",
            "write": true,
            "given": 1,
            "ask": "Black's answer",
            "label": "Red1 Rfd8",
            "mustPlay": [
              "Red1",
              "Rfd8"
            ],
            "key": "<p>Pseudo-activity. The rook looks busy. Black contests the file and you are worse (~\u22121.7). This is the move if he does not grab a2.</p>"
          }
        ],
        "key": "<p><b>All four.</b> a4 is not refuted by a6. Bxg2 with Bd7 is a fight; Bxg2 without Bd7 is a blunder. Bd4 loses a2. Red1 dies to Rfd8.</p>"
      },
      {
        "id": "trap",
        "name": "4 Trap",
        "title": "The game: after 20.Red1, Black to move",
        "prompt": "He grabbed. Play \u2026Qxa2 then Ra1.",
        "fen": "r4rk1/p3ppbp/1p4p1/qB1bP3/8/7P/PB2QPP1/1R1R2K1 b - - 3 20",
        "mustPlay": [
          "Qxa2",
          "Ra1"
        ],
        "questions": [
          {
            "name": "hunt",
            "label": "After \u2026Qb3, White\u2019s hunt move?",
            "type": "text"
          },
          {
            "name": "instead",
            "label": "The move that refutes Red1 if Black does not grab?",
            "hint": "Rfd8",
            "type": "text"
          }
        ],
        "key": "<p><b>21.Ra1</b>, then <b>22.Ra3</b>. Refutation if he does not grab: <b>\u2026Rfd8</b>.</p>"
      },
      {
        "id": "hunt",
        "name": "5 Hunt",
        "title": "After 21\u2026Qb3, White to move",
        "prompt": "Play the hunt move, then tag the game honestly.",
        "fen": "r4rk1/p3ppbp/1p4p1/1B1bP3/8/1q5P/1B2QPP1/R2R2K1 w - - 2 22",
        "mustPlay": [
          "Ra3"
        ],
        "questions": [
          {
            "name": "why",
            "label": "5.1 Why did you win?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "trap",
                "label": "I calculated the trap and he walked in"
              },
              {
                "value": "blunder",
                "label": "He hung it; 20.Red1 was still a mistake"
              },
              {
                "value": "both",
                "label": "Both: the hunt was real, and Red1 still needed the blunder"
              }
            ]
          },
          {
            "name": "next",
            "label": "5.2 Next time, move 20 is",
            "type": "text"
          },
          {
            "name": "tag",
            "label": "5.3 Tag",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "calculation",
                "label": "calculation"
              },
              {
                "value": "conversion",
                "label": "conversion"
              },
              {
                "value": "opening",
                "label": "opening"
              },
              {
                "value": "time",
                "label": "time"
              },
              {
                "value": "clean",
                "label": "clean"
              }
            ]
          },
          {
            "name": "note",
            "label": "5.4 Log note",
            "type": "textarea"
          }
        ],
        "key": "<p>Tag <b>calculation</b>, not clean. The miss was stopping at \u2026a6. Logged to the dossier.</p>"
      }
    ]
  },
  "XbhWoWMi": {
    "id": "XbhWoWMi",
    "url": "https://lichess.org/XbhWoWMi",
    "title": "15+10 \u00b7 you White \u00b7 French Winawer",
    "date": "2026-09-12 20:56",
    "result": "0-1",
    "category": "leak",
    "event": "Lichess 15+10 vs marky0",
    "startFen": "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15",
    "logNote": "Saw Nxf5 gxf5 Bxf5 Bxf5 and stopped on my own capture; missed \u2026Qxf5 (ply 5). Clock 12:05 \u2192 3:26 over moves 22\u201326, then 32.Kg2?? Qg5+.",
    "steps": [
      {
        "id": "threeply",
        "type": "stopPly",
        "name": "1 Three ply",
        "title": "After 14\u2026Nd6, White to move",
        "prompt": "You played 15.Qg3. Name the reply you had to calculate, then write every move until nothing can take back.",
        "fen": "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15",
        "stopPly": {
          "candidate": "Qg3",
          "scare": "Nxf5",
          "continue": [
            "gxf5",
            "Bxf5",
            "Bxf5",
            "Qxf5"
          ],
          "mixups": [
            {
              "match": [
                "gxf5",
                "Bxf5",
                "Bf6"
              ],
              "line": [
                "Qg3",
                "Nxf5",
                "gxf5",
                "Bxf5",
                "Bf6"
              ],
              "key": "<p class='bad'>That is the game: you saw \u2026Qxf5 at the board, one move too late, and went Bf6 (~\u22122). The drill is to finish the captures before 15.Qg3, not after.</p>"
            }
          ]
        },
        "questions": [],
        "key": "<p class='ok'>Ply 5 is <b>\u2026Qxf5</b>: the d7 queen through the empty e6. Three attackers, two defenders, a pawn down (~\u22123). You had ply 1 to 4 in the game. The fifth is the drill.</p>"
      },
      {
        "id": "diagnose",
        "name": "2 Diagnose",
        "title": "After 14\u2026Nd6, White to move",
        "prompt": "Count f5 before you move. Count to the last capture, not to the one you like.",
        "fen": "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15",
        "mustPlay": [],
        "questions": [
          {
            "name": "material",
            "label": "2.1 Material",
            "hint": "Who is up, and by how much?",
            "type": "text"
          },
          {
            "name": "attackers",
            "label": "2.2 Black pieces that hit f5",
            "hint": "There are three.",
            "type": "triple",
            "names": [
              "a1",
              "a2",
              "a3"
            ]
          },
          {
            "name": "defenders",
            "label": "2.3 White pieces that defend f5",
            "hint": "How many, and which?",
            "type": "text"
          }
        ],
        "key": "<p><b>Material:</b> equal. The opening was not the problem: you were better through move 13 (8.O-O and 13.Bg5 let some of it go, nothing more).</p><p><b>f5:</b> three attackers \u2014 Nd6, Bg6 and <b>Qd7</b> \u2014 against two defenders, g4 and Bd3. The queen looks through e6, which has been empty since 4.exd5 exd5.</p><p>You did not stop at a scary reply this time. You stopped at <b>your own recapture</b>. Ply 5 is <b>\u2026Qxf5</b>.</p>"
      },
      {
        "id": "calculate",
        "name": "3 Calculate",
        "title": "Four lines from move 15. Count to the end of the captures.",
        "prompt": "The first branch shows only Qg3 \u2014 write the whole count, including the move you stopped before (Enter checks it). The others you play through. The step's key opens once all four are locked.",
        "fen": "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15",
        "questions": [
          {
            "name": "whynot",
            "label": "After 15.Qg3 Nxf5 gxf5 Bxf5, why not 17.Bxf5?",
            "type": "textarea"
          },
          {
            "name": "nxd6",
            "label": "15.Nxd6 first \u2014 what does it remove from the count?",
            "type": "text"
          }
        ],
        "branches": [
          {
            "id": "count",
            "write": true,
            "given": 1,
            "ask": "count f5 to the last capture",
            "label": "Qg3 Nxf5 gxf5 Bxf5 Bxf5 Qxf5",
            "mustPlay": [
              "Qg3",
              "Nxf5",
              "gxf5",
              "Bxf5",
              "Bxf5",
              "Qxf5"
            ],
            "key": "<p class='bad'>The line you stopped one ply short. You counted the knights off and the bishop taken, then the queen takes back. A pawn down with the kingside open (~\u22123). Nothing is won.</p>"
          },
          {
            "id": "game",
            "label": "Qg3 Nxf5 gxf5 Bxf5 Bf6 (game)",
            "mustPlay": [
              "Qg3",
              "Nxf5",
              "gxf5",
              "Bxf5",
              "Bf6"
            ],
            "key": "<p class='bad'>The game. You saw \u2026Qxf5 one move too late and put the bishop on f6 for an attack. After 17\u2026Bg6 18.f4 gxf6 it is still about \u22122. The attack did not pay for the pawn.</p>"
          },
          {
            "id": "nxd6",
            "label": "Nxd6 Bxd3 cxd3 Qxd6",
            "mustPlay": [
              "Nxd6",
              "Bxd3",
              "cxd3",
              "Qxd6"
            ],
            "key": "<p class='ok'>Take the attacker first. The knight is gone, the bishops come off, and nobody is aiming at f5 anymore. About equal.</p>"
          },
          {
            "id": "ne3",
            "label": "Ne3",
            "mustPlay": [
              "Ne3"
            ],
            "key": "<p class='ok'>Engine's first choice, about equal. The knight leaves before it can be counted off and hits d5 from e3. Stepping back is fine when the count is 3 against 2.</p>"
          }
        ],
        "key": "<p><b>All four.</b> Qg3 does nothing about f5, and the count loses a pawn. Nxd6 and Ne3 keep it equal. The skill is not seeing Nxf5. You saw it. The skill is playing to the last capture.</p>"
      },
      {
        "id": "trap",
        "name": "4 Clock",
        "title": "After 31\u2026Qe3+, White to move (1:42 left)",
        "prompt": "Three king moves draw. One loses. For 32.Kg2 write what follows to the end; the other king move you play through.",
        "fen": "6n1/ppp3k1/5pPp/3Q4/3P4/2PBq3/P1P5/6K1 w - - 1 32",
        "questions": [
          {
            "name": "check",
            "label": "4.1 After 32.Kg2, which check wins?",
            "type": "text"
          },
          {
            "name": "safe",
            "label": "4.2 Three king moves that draw",
            "type": "triple",
            "names": [
              "k1",
              "k2",
              "k3"
            ]
          }
        ],
        "branches": [
          {
            "id": "kg2",
            "write": true,
            "given": 1,
            "ask": "Black to move",
            "alts": [
              [
                "Kg2",
                "Qg5+",
                "Qxg5",
                "fxg5"
              ]
            ],
            "label": "Kg2 Qg5+ Qxg5 hxg5 (game)",
            "mustPlay": [
              "Kg2",
              "Qg5+",
              "Qxg5",
              "hxg5"
            ],
            "key": "<p class='bad'>\u2026Qg5+ checks down the g-file and hits your queen on d5 along the fifth rank. You have to trade. In the knight-vs-bishop ending g6 falls and Black wins.</p>"
          },
          {
            "id": "kh2",
            "label": "Kh2 Qf4+ Kh3 Qe3+",
            "mustPlay": [
              "Kh2",
              "Qf4+",
              "Kh3",
              "Qe3+"
            ],
            "key": "<p class='ok'>Off the g-file. Black has only checks, and it is a draw. Kh1 and Kf1 are the same.</p>"
          }
        ],
        "key": "<p>At 1:42 the question is only: <b>which squares let him check and hit something at the same time?</b> g2 was the only one.</p>"
      },
      {
        "id": "log",
        "name": "5 Log",
        "title": "Tag the loss honestly",
        "prompt": "Three moments. Pick the one that cost the game first.",
        "fen": "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15",
        "mustPlay": [],
        "questions": [
          {
            "name": "why",
            "label": "5.1 Why did you lose?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "count",
                "label": "15.Qg3: I stopped at my own Bxf5 and missed \u2026Qxf5"
              },
              {
                "value": "time",
                "label": "The clock: 12:05 \u2192 3:26 over moves 22\u201326 in a level position"
              },
              {
                "value": "kg2",
                "label": "32.Kg2?? in time trouble"
              },
              {
                "value": "all",
                "label": "All three, in that order"
              }
            ]
          },
          {
            "name": "minutes",
            "label": "5.2 Moves 22\u201326 cost nine minutes at about equal. What were you calculating?",
            "type": "textarea"
          },
          {
            "name": "tag",
            "label": "5.3 Tag",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "calculation",
                "label": "calculation"
              },
              {
                "value": "time",
                "label": "time"
              },
              {
                "value": "conversion",
                "label": "conversion"
              },
              {
                "value": "opening",
                "label": "opening"
              },
              {
                "value": "clean",
                "label": "clean"
              }
            ]
          },
          {
            "name": "note",
            "label": "5.4 Log note",
            "type": "textarea"
          }
        ],
        "key": "<p>Tag <b>calculation</b>. Move 15 put you two pawns' worth down, and the clock and Kg2 came after it. Last week you stopped at the reply you disliked (\u2026a6). This week you stopped at the recapture you liked (Bxf5). Same leak. Three more ply.</p>"
      }
    ]
  },
  "ifwu8ybv": {
    "id": "ifwu8ybv",
    "url": "https://lichess.org/ifwu8ybv",
    "player": "ferho",
    "title": "Your rapid win vs Zap_El \u00b7 you Black \u00b7 Scandinavian",
    "date": "2026-09-29",
    "result": "0-1",
    "event": "Lichess rapid 15+10 \u00b7 Zap_El 1661 (White) vs Ferho36 1639 (Black) \u00b7 White resigned on move 20",
    "startFen": "r3kb1r/pppnpppp/5n2/q6b/3P4/2N2N1P/PPP1BPP1/R1BQ1RK1 b kq - 4 8",
    "logNote": "Ferho's attacking win: honest about the risky moments (8\u2026O-O-O, the h-file pawn), celebrating the finish (\u2026Rxe4!, \u2026Nf3+). Objectively White was better until 17.Ne4??; 17.Bg5! was the only defence.",
    "steps": [
      {
        "id": "king",
        "name": "1 Where does the king go?",
        "title": "Move 8 \u00b7 Black to move \u00b7 White has castled short",
        "prompt": "Your queen stands on a5 and your knights are out. In the game you played 8\u2026O-O-O. Find a quieter move that gets your king safe on the short side first.",
        "fen": "r3kb1r/pppnpppp/5n2/q6b/3P4/2N2N1P/PPP1BPP1/R1BQ1RK1 b kq - 4 8",
        "questions": [
          {
            "name": "why",
            "type": "select",
            "label": "1.1 Why is 8\u2026O-O-O risky here?",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "storm",
                "label": "My king and queen stand together on the queenside, and White's a- and b-pawns can attack both with gain of time"
              },
              {
                "value": "rook",
                "label": "The rook on d8 has nothing to do"
              },
              {
                "value": "nothing",
                "label": "It isn't risky"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "e6",
            "label": "8\u2026e6",
            "write": true,
            "given": 0,
            "ask": "the quiet move that prepares short castling",
            "mustPlay": [
              "e6"
            ],
            "alts": [
              [
                "c6"
              ]
            ],
            "key": "<p class='ok'><b>8\u2026e6</b>. The bishop on f8 can come out (\u2026Be7) and the king castles short, where no white pawn is coming. (8\u2026c6, giving the queen a way back to c7 and d8, is just as good.) The engine calls it almost level.</p>"
          },
          {
            "id": "storm",
            "label": "8\u2026O-O-O 9.Bd2 a6 10.g4 Bg6 11.a4 Kb8 12.b4 \u00b7 the pawns come",
            "mustPlay": [
              "O-O-O",
              "Bd2",
              "a6",
              "g4",
              "Bg6",
              "a4",
              "Kb8",
              "b4"
            ],
            "key": "<p class='ok'><b>8\u2026O-O-O 9.Bd2!</b> The bishop now lines up with your queen behind the c3 knight: any knight jump uncovers an attack on a5. Then a4 and b4 follow, each with tempo on the queen, and your king stands right behind it. White is clearly better (the engine says about +2.5). In the game your opponent played 9.Ng5 instead and gave you chances.</p>"
          }
        ],
        "key": "<p><b>Set-up idea:</b> before you castle long, look where the opponent's pawns can run. With the queen on a5 and the king on c8, every pawn move a4, b4 hits something. Short castling first, attack later.</p>"
      },
      {
        "id": "recapture",
        "name": "2 Take back towards the h-file",
        "title": "After 11.Bxg6 \u00b7 Black to move \u00b7 which pawn takes?",
        "prompt": "White's bishop just took on g6 and his knight on g5 is still attacked by your h6 pawn. Two pawns can take on g6. One takes with tempo, the other walks into a fork. Find the right one, then find the fork after the wrong one.",
        "fen": "2kr1b1r/pppnppp1/5nBp/q5N1/3P4/2N4P/PPP2PP1/R1BQ1RK1 b - - 0 11",
        "questions": [
          {
            "name": "gain",
            "type": "select",
            "label": "2.1 After 11\u2026hxg5 12.Bxf7 White is a pawn up. What did you get for it?",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "file",
                "label": "The h-file is open towards h3 and the white king, and my rook on h8 is already on it"
              },
              {
                "value": "piece",
                "label": "A piece"
              },
              {
                "value": "nothing",
                "label": "Nothing"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "hxg5",
            "label": "11\u2026hxg5",
            "write": true,
            "given": 0,
            "ask": "the right recapture",
            "mustPlay": [
              "hxg5"
            ],
            "key": "<p class='ok'><b>11\u2026hxg5!</b> You take the knight, not the bishop: the h-file opens for your rook on h8. White takes back a pawn with 12.Bxf7, but now the rook looks at h3 and the white king. That was the plan of your whole game.</p>"
          },
          {
            "id": "fxg6",
            "label": "11\u2026fxg6? \u00b7 the fork",
            "write": true,
            "given": 1,
            "ask": "White's knight jump",
            "mustPlay": [
              "fxg6",
              "Nf7"
            ],
            "alts": [
              [
                "fxg6",
                "Ne6"
              ]
            ],
            "key": "<p class='ok'><b>11\u2026fxg6? 12.Nf7!</b> The knight attacks both rooks, d8 and h8. White wins the exchange and is winning (the engine says +6.6). (12.Ne6, hitting d8 and the pawn on c7, is almost as strong.) Before you recapture, check every knight jump the opponent gets.</p>"
          }
        ],
        "key": "<p><b>Tactic habit:</b> when two pieces can take, look at what each recapture <i>opens</i> and what it <i>allows</i>. hxg5 opened your rook's file; fxg6 opened f7 for a fork.</p>"
      },
      {
        "id": "sac",
        "name": "3 Bring more pieces first",
        "title": "Move 14 \u00b7 Black to move \u00b7 the rook looks at h3",
        "prompt": "White's bishop has come back to h3. In the game you gave the rook at once: 14\u2026Rxh3 15.gxh3. Brave, and it worked. The engine likes a pawn move first that brings your queen and bishop into the attack. Find it.",
        "fen": "2kr1b1r/pppnp1p1/5n2/q7/3P4/2N4B/PPP2PP1/R1BQ1RK1 b - - 0 14",
        "questions": [
          {
            "name": "sacwhy",
            "type": "select",
            "label": "3.1 After \u2026Rxh3 gxh3, what makes the sacrifice work in practice?",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "king",
                "label": "White's king has no pawn shield, and my queen and knights can reach h3, f3 and g4"
              },
              {
                "value": "material",
                "label": "I win the material back at once"
              },
              {
                "value": "mate",
                "label": "It is forced mate"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "e5",
            "label": "14\u2026e5",
            "write": true,
            "given": 0,
            "ask": "the pawn move that opens lines for your queen and bishop",
            "mustPlay": [
              "e5"
            ],
            "alts": [
              [
                "Rxh3"
              ]
            ],
            "key": "<p class='ok'><b>14\u2026e5</b>. The bishop on f8 sees c5 and the queen can swing to e5 and f5. (14\u2026Rxh3, your move in the game, is also fine: the engine rates both about the same.) White stays better on paper, but now every black piece joins the attack.</p>"
          },
          {
            "id": "line",
            "label": "14\u2026e5 15.dxe5 Qxe5 16.Re1 Qa5 17.Bf4 Rxh3 18.gxh3 \u00b7 the same sacrifice, later",
            "mustPlay": [
              "e5",
              "dxe5",
              "Qxe5",
              "Re1",
              "Qa5",
              "Bf4",
              "Rxh3",
              "gxh3"
            ],
            "key": "<p class='ok'>The engine's line: queen in first, then <b>\u2026Rxh3</b> anyway, and \u2026Qf5 comes next towards h3. Same idea as in your game, with one more piece ready. A good rule for attacks: count the pieces that can join before you sacrifice.</p>"
          }
        ],
        "key": "<p><b>Attacking idea:</b> your sacrifice on h3 was right in spirit: White's king lost its pawns and was never safe again. To make a sacrifice stronger, bring one more piece first, if the opponent can't close the door in the meantime.</p>"
      },
      {
        "id": "defence",
        "name": "4 White's only defence",
        "title": "After 16\u2026Rxd4 \u00b7 White to move \u00b7 stop the knight fork",
        "prompt": "Now you are White. Black's knight on e5 wants to jump to f3 with check, attacking your queen on e2. In the game White played 17.Ne4?? and lost. Find the only move that keeps White better.",
        "fen": "2k2b2/ppp1p1p1/5n2/q3n3/3r4/2N4P/PPP1QP2/R1B2RK1 w - - 0 17",
        "questions": [],
        "branches": [
          {
            "id": "bg5",
            "label": "17.Bg5",
            "write": true,
            "given": 0,
            "ask": "White's defence",
            "mustPlay": [
              "Bg5"
            ],
            "key": "<p class='ok'><b>17.Bg5!</b> It attacks the knight on f6 and gets the bishop off c1. If 17\u2026Nf3+ 18.Qxf3! Qxg5+ 19.Qg3, the queen is safe and White is still the exchange up.</p>"
          },
          {
            "id": "bg5-line",
            "label": "17.Bg5 Nf3+ 18.Qxf3 Qxg5+ 19.Qg3 \u00b7 the fork is defused",
            "mustPlay": [
              "Bg5",
              "Nf3+",
              "Qxf3",
              "Qxg5+",
              "Qg3"
            ],
            "key": "<p class='ok'>The knight is taken, the bishop is lost, but White's queen survives and White keeps an extra exchange. Your opponent didn't see \u2026Nf3+ coming. That is why practical attacks work: one natural move like 17.Ne4 and it is over.</p>"
          }
        ],
        "key": "<p><b>Defence habit:</b> when the opponent's knight has a square that checks and hits your queen, deal with that square <i>now</i>. 17.Ne4?? ignored f3, and step 5 shows what happened.</p>"
      },
      {
        "id": "finish",
        "name": "5 The finish",
        "title": "After 17.Ne4 \u00b7 Black to move \u00b7 your moment",
        "prompt": "White just put his knight on e4. Only one move wins. Find it, then write the whole line to the end: White's best try is 18.Qd2, and you have a knight check.",
        "fen": "2k2b2/ppp1p1p1/5n2/q3n3/3rN3/7P/PPP1QP2/R1B2RK1 b - - 1 17",
        "questions": [
          {
            "name": "pattern",
            "type": "select",
            "label": "5.1 What is 19\u2026Nxd2 after 18.Qd2 Nf3+ 19.Kg2?",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "fork",
                "label": "A knight fork: the check on f3 hit the king and the queen at the same time"
              },
              {
                "value": "pin",
                "label": "A pin"
              },
              {
                "value": "mate",
                "label": "Mate"
              }
            ]
          }
        ],
        "branches": [
          {
            "id": "rxe4",
            "label": "17\u2026Rxe4",
            "write": true,
            "given": 0,
            "ask": "the winning move",
            "mustPlay": [
              "Rxe4"
            ],
            "key": "<p class='ok'><b>17\u2026Rxe4!</b> The rook takes the knight, and if 18.Qxe4 Nxe4 your f6 knight simply takes the queen. Every other move lets White off (the engine: from about +4 for White to \u22126.5).</p>"
          },
          {
            "id": "fork",
            "label": "17\u2026Rxe4 18.Qd2 \u00b7 write it to the end",
            "write": true,
            "given": 2,
            "ask": "your check and how it ends",
            "mustPlay": [
              "Rxe4",
              "Qd2",
              "Nf3+",
              "Kg2",
              "Nxd2"
            ],
            "key": "<p class='ok'><b>18\u2026Nf3+! 19.Kg2 Nxd2</b>. The knight checks and hits the queen: <b>fork</b>. (19.Kh1?? is even worse: \u2026Qf5 and mate follows.) After 20.Bxd2 you are a rook up and White resigned on move 20. You saw the whole thing.</p>"
          }
        ],
        "key": "<p><b>Tactic pattern: the knight fork with check.</b> Look for squares where your knight gives check <i>and</i> attacks the queen. Here f3 was that square for three moves. You kept it in mind and struck when it worked.</p>"
      },
      {
        "id": "takeaways",
        "name": "6 Your three habits",
        "title": "What to take into the next game",
        "prompt": "A brave game with a sharp finish. Pick the habit you want to keep. There is no wrong answer, it is for you.",
        "fen": "2k2b2/ppp1p1p1/5n2/q7/4r3/7P/PPPB1PK1/R4R2 b - - 0 20",
        "mustPlay": [],
        "questions": [
          {
            "name": "habit",
            "type": "select",
            "label": "6.1 Which habit first?",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "castle",
                "label": "Before castling long: where can the opponent's pawns run?"
              },
              {
                "value": "pieces",
                "label": "Before a sacrifice: count the pieces that can join"
              },
              {
                "value": "forks",
                "label": "Every move: which squares give my knight check plus an attack on the queen?"
              }
            ]
          }
        ],
        "key": "<p><b>What went well:</b> you opened the h-file on purpose, gave material to strip White's king, and found \u2026Rxe4! and \u2026Nf3+ the moment White slipped. That is real attacking chess.</p><p><b>What to watch:</b> 8\u2026O-O-O put your king in front of White's pawns, and until move 17 White was better. Safe king first, then attack with every piece.</p><p><b>Next:</b> open <b>Training</b> in the game list. Every day you get a few positions from real Lichess games near your rating. Write the whole line, both sides, until nothing more is taken, then Lock.</p>"
      }
    ]
  },
  "qVxKt9G0": {
    "id": "qVxKt9G0",
    "url": "https://lichess.org/qVxKt9G0",
    "title": "Simul vs GM Rabiega \u00b7 you Black \u00b7 Alapin Sicilian",
    "date": "2026-09-19 19:00",
    "result": "1/2-1/2",
    "category": "leak",
    "event": "Jubil\u00e4umssimultan 75 Jahre SC Weisse Dame \u00b7 GM Robert Rabiega (DWZ 2421) \u00b7 no clock, move when he arrives",
    "startFen": "r5k1/6pp/1ppB1p2/3p4/3P4/P2b1P2/1P4PP/4R1K1 b - - 1 25",
    "logNote": "Simul 19.09.26 vs GM Rabiega, \u00bd \u2014 offered by the GM in a lost position (about +5 at move 45). Saw 26.Re8+ Kf7 and stopped there; 27.Rc8! wins c6. Then 28\u2026Ra6 handed over the seventh (29.Rb7! was winning). Lost from 31\u2026c5 on.",
    "steps": [
      {
        "id": "onemore",
        "type": "stopPly",
        "name": "1 One move more",
        "title": "After 25.Re1, Black to move",
        "prompt": "You played 25\u2026Ra7. Name the reply you looked at, then write every move after it \u2014 until a pawn falls.",
        "fen": "r5k1/6pp/1ppB1p2/3p4/3P4/P2b1P2/1P4PP/4R1K1 b - - 1 25",
        "stopPly": {
          "candidate": "Ra7",
          "scare": "Re8+",
          "continue": [
            "Kf7",
            "Rc8",
            "Bc4",
            "Rxc6"
          ],
          "mixups": [
            {
              "match": [
                "Kf7",
                "Rb8"
              ],
              "line": [
                "Ra7",
                "Re8+",
                "Kf7",
                "Rb8",
                "Ke6",
                "Bb4"
              ],
              "key": "<p class='bad'>That is the game. 27.Rb8 lets you back in with 27\u2026Ke6, and you were still only slightly worse. The move you had to calculate is <b>27.Rc8</b> \u2014 it attacks c6, and a7 cannot defend it.</p>"
            }
          ]
        },
        "questions": [],
        "key": "<p class='ok'>Ply 3 is <b>27.Rc8</b>. The rook steps in front of your weak pawn, not behind it: 27\u2026Bc4 28.Rxc6 and c6 is gone with the rook on a7 watching. You saw 26.Re8+, you saw 26\u2026Kf7, and you stopped there because Kf7 looked fine. It is fine. The move after it is not.</p><p>25\u2026<b>Rc8</b> keeps the balance: the rook defends c6 along the rank and the file is not White's anymore.</p>"
      },
      {
        "id": "diagnose",
        "name": "2 Diagnose",
        "title": "After 25.Re1, Black to move",
        "prompt": "One open file, one weak pawn. Decide where the rook belongs before you calculate.",
        "fen": "r5k1/6pp/1ppB1p2/3p4/3P4/P2b1P2/1P4PP/4R1K1 b - - 1 25",
        "mustPlay": [],
        "questions": [
          {
            "name": "weak",
            "label": "2.1 Which black pawn is the target?",
            "hint": "It appeared on move 24 and cannot be defended by another pawn.",
            "type": "text"
          },
          {
            "name": "entry",
            "label": "2.2 White's rook entry squares on the open file",
            "hint": "Two of them. One is only a check; the other hits the pawn.",
            "type": "triple",
            "names": [
              "e1",
              "e2",
              "e3"
            ]
          },
          {
            "name": "job",
            "label": "2.3 What does the rook on a7 defend that is actually attacked?",
            "type": "text"
          }
        ],
        "key": "<p><b>The target is c6</b>, made on 24\u2026bxc6. No pawn can ever defend it \u2014 only a piece can, and only from the c-file or the sixth rank.</p><p><b>Entry squares: e8 and c8.</b> e8 is a check and nothing more. c8 is the move: it attacks c6 and takes the file for good.</p><p><b>The rook on a7 defends nothing that is attacked.</b> It guards the seventh rank and the b7 square, and neither is under fire. Your own sentence from game 1, now against you: <i>\"Red1 is pseudo-activity; Black can put a rook on the file.\"</i> Here you were the one who left the file alone.</p>"
      },
      {
        "id": "calculate",
        "name": "3 Calculate",
        "title": "Four rook moves from move 25. Play each one to the end.",
        "prompt": "Two branches show only the first moves \u2014 write the rest before you touch the board (Enter checks it). The other two you play through. The step's key opens once all four are locked.",
        "fen": "r5k1/6pp/1ppB1p2/3p4/3P4/P2b1P2/1P4PP/4R1K1 b - - 1 25",
        "questions": [
          {
            "name": "whyc8",
            "label": "After 25\u2026Rc8, White plays 26.Re3 Bc4 27.b3. Why is the c6 pawn not falling here?",
            "type": "textarea"
          },
          {
            "name": "re8",
            "label": "25\u2026Re8 offers a trade. In one word, why is it not a trade?",
            "type": "text"
          }
        ],
        "branches": [
          {
            "id": "punish",
            "write": true,
            "given": 3,
            "ask": "White's strongest",
            "alts": [
              [
                "Ra7",
                "Re8+",
                "Kf7",
                "Rc8",
                "Rb7",
                "Rxc6"
              ],
              [
                "Ra7",
                "Re8+",
                "Kf7",
                "Rc8",
                "h5",
                "Rxc6"
              ],
              [
                "Ra7",
                "Re8+",
                "Kf7",
                "Rc8",
                "g5",
                "Rxc6"
              ],
              [
                "Ra7",
                "Re8+",
                "Kf7",
                "Rc8",
                "Bb5",
                "Rb8"
              ]
            ],
            "label": "Ra7 Re8+ Kf7 Rc8 Bc4 Rxc6",
            "mustPlay": [
              "Ra7",
              "Re8+",
              "Kf7",
              "Rc8",
              "Bc4",
              "Rxc6"
            ],
            "key": "<p class='bad'>The line you stopped two moves short of. A pawn down, both your remaining pawn islands loose, and the rook on a7 has nothing to do. This is a clear White advantage, not a nuance.</p>"
          },
          {
            "id": "game",
            "label": "Ra7 Re8+ Kf7 Rb8 Ke6 Bb4 (game)",
            "mustPlay": [
              "Ra7",
              "Re8+",
              "Kf7",
              "Rb8",
              "Ke6",
              "Bb4"
            ],
            "key": "<p class='bad'>The game. 27.Rb8 goes after b6 instead of c6 and you got the king to e6 in time. You were let off \u2014 the punishment was 27.Rc8. Do not file this position as \"Ra7 was playable\".</p>"
          },
          {
            "id": "hold",
            "label": "Rc8 Re3 Bc4 b3 Ba6",
            "mustPlay": [
              "Rc8",
              "Re3",
              "Bc4",
              "b3",
              "Ba6"
            ],
            "key": "<p class='ok'>Dead level. The rook on c8 defends c6 sideways, so the bishop is free to go hunting on the a6\u2013f1 diagonal. Nothing can enter. This is what the position was worth before you moved.</p>"
          },
          {
            "id": "trade",
            "write": true,
            "given": 1,
            "ask": "is it a trade?",
            "alts": [
              [
                "Re8",
                "Rxe8+",
                "Kf7",
                "Re1"
              ],
              [
                "Re8",
                "Rxe8+",
                "Kf7",
                "Re3"
              ]
            ],
            "label": "Re8 Rxe8+ Kf7 Re7+",
            "mustPlay": [
              "Re8",
              "Rxe8+",
              "Kf7",
              "Re7+"
            ],
            "key": "<p class='bad'>Not a trade \u2014 <b>a check</b>. Your king is on g8 and cannot reach e8, so the rook is simply gone. The same one-ply habit in its crudest form: you look at the capture you like and not at the plus sign behind it.</p>"
          }
        ],
        "key": "<p><b>All four.</b> Rc8 holds, Ra7 loses a pawn by force, Re8 loses a rook. The difference between the first two is not judgement \u2014 it is three more ply.</p>"
      },
      {
        "id": "seventh",
        "name": "4 The seventh",
        "title": "After 28.Bb4, Black to move",
        "prompt": "Three moves later, the same rook. This time it was doing a job. Find what leaving costs.",
        "fen": "1R6/r5pp/1pp1kp2/3p4/1B1P4/P2b1P2/1P4PP/6K1 b - - 7 28",
        "questions": [
          {
            "name": "guard",
            "label": "4.1 What is the rook on a7 guarding now that it was not guarding on move 25?",
            "type": "text"
          },
          {
            "name": "missed",
            "label": "4.2 After 28\u2026Ra6, which move did White miss?",
            "type": "text"
          }
        ],
        "branches": [
          {
            "id": "game",
            "label": "Ra6 Rb7 g5 Re7+ Kf5 Rxh7 (game move, punished)",
            "mustPlay": [
              "Ra6",
              "Rb7",
              "g5",
              "Re7+",
              "Kf5",
              "Rxh7"
            ],
            "key": "<p class='bad'>29.Rb7! and the seventh rank is his. h7 falls, then g7, and the a6 rook is defending a pawn that nobody is attacking. Winning for White. In the game he played 29.Re8+ instead and you were back to one pawn down.</p>"
          },
          {
            "id": "hold",
            "label": "b5 Re8+ Kf7 Rc8 g5",
            "mustPlay": [
              "b5",
              "Re8+",
              "Kf7",
              "Rc8",
              "g5"
            ],
            "key": "<p class='ok'>Push the attacked pawn, keep the rook. b6 was the reason you wanted Ra6 \u2014 so move b6 and the reason disappears. The rook stays on the seventh, h7 and g7 stay defended, and you are a pawn worse instead of lost.</p>"
          }
        ],
        "key": "<p>Move 25: the rook on a7 defended nothing and you put it there. Move 28: the rook on a7 defended g7 and h7 and you took it away. Both times you decided where the rook belongs without playing the opponent's entry move \u2014 27.Rc8, 29.Rb7. <b>Name his entry square first, then choose.</b></p>"
      },
      {
        "id": "log",
        "name": "5 Log",
        "title": "A draw you were given, honestly tagged",
        "prompt": "The result says \u00bd. The board at the end says lost. Tag the game, not the result.",
        "fen": "8/6pk/3R1p2/P2p3p/2bB3P/5PK1/1P4P1/3r4 w - - 13 46",
        "mustPlay": [],
        "questions": [
          {
            "name": "why",
            "label": "5.1 What cost the half point first?",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "ra7",
                "label": "25\u2026Ra7: saw 26.Re8+ Kf7 and stopped there"
              },
              {
                "value": "ra6",
                "label": "28\u2026Ra6: gave up the seventh rank"
              },
              {
                "value": "c5",
                "label": "31\u2026c5: opened it up when a pawn down"
              },
              {
                "value": "both",
                "label": "25\u2026Ra7 and 28\u2026Ra6 \u2014 the same rook, the same missing move"
              }
            ]
          },
          {
            "name": "lost",
            "label": "5.2 The result says \u00bd. From which move was the position lost?",
            "hint": "The evaluation crosses two pawns once and never comes back.",
            "type": "text"
          },
          {
            "name": "tag",
            "label": "5.3 Tag",
            "type": "select",
            "options": [
              {
                "value": "",
                "label": "choose"
              },
              {
                "value": "calculation",
                "label": "calculation"
              },
              {
                "value": "time",
                "label": "time"
              },
              {
                "value": "conversion",
                "label": "conversion"
              },
              {
                "value": "opening",
                "label": "opening"
              },
              {
                "value": "clean",
                "label": "clean"
              }
            ]
          },
          {
            "name": "note",
            "label": "5.4 Log note",
            "type": "textarea"
          }
        ],
        "key": "<p><b>The half point was offered, not earned.</b> At move 45 White is more than five pawns up and the a-pawn is running. Late in a four-and-a-half-hour simul a GM offers draws to finish the evening. Rabiega's 17:2 (+15 =4 -0) is his statistic; do not file this as a defence.</p><p><b>Lost from 31\u2026c5.</b> Before it you were a pawn worse and suffering; after 32.dxc5 bxc5 33.Rxc5 you were two pawns down with nothing for them. Before that, 28\u2026Ra6 had already given up the seventh, and 25\u2026Ra7 had started it.</p><p>Tag <b>calculation</b>. The opening was fine and the middlegame was level right up to move 25 \u2014 the whole game turned on two rook moves, and both times the move you did not make was the opponent's entry move.</p><p>Game 1: you stopped at the reply you disliked (\u2026a6). Game 2: you stopped at the recapture you liked (Bxf5). Here: you stopped at <b>the move that looked fine</b> (\u2026Kf7). Three games, one habit. The move after the one that looks fine is the move.</p><p><b>No clock, but he arrives and you must move.</b> That is the argument for the habit, not against it: when there is no time to calculate deep, the one question that still fits is <i>where does his rook come in?</i> \u2014 c8 on move 25, b7 on move 28. Ask it first and both moves choose themselves.</p>"
      }
    ]
  }
};
