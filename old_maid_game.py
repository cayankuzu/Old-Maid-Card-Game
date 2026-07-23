from random import shuffle, seed, choice #import 'shuffle' for shuffle deck, 'seed' for set same randomness, 'choice' for selecting card from deck or players
from collections import Counter #for count to card for pairs

VALUE_MAP = {i: "A" if j == 1 else "V" if j == 11 else "Q" if j == 12 else "R" if j == 13
              else j for i, j in zip(range(1, 14), range(1, 14))} # for matching(map) spesific cards A(As)=1, V(Vale)=11, Q(Queen)=12, R(King)=13 to symbols


#this class for represending each card in the deck
class Card:
    def __init__(self, symbol, value): #creating cards with their symbols and values(numbers)
        self.symbol = symbol
        self.value = value

    def __str__(self):
        msg = f"{VALUE_MAP[self.value]}{self.symbol}" #matching card numbers to their symbols. ex:  ('♣', 1) -> (As♣), ('♦', 10) -> (10♦)
        return msg


#deck class to manage the deck of cards
class Deck:
    def __init__(self):
        start = 1 #setting card numbers start. for exemple if we select 2 then 1 (aces) are will not creat.
        self.clubs = [Card('♣',i) for i in range(start,14)] #creating Clubs
        self.diamonds = [Card('♦',i) for i in range(start,14)] #creating Diamonds
        self.hearts = [Card('♥',i) for i in range(start,14)] #creating Hearts
        self.spades= [Card('♠',i) for i in range(start,14)] # creating Spades
        self.create_deck() #we have to create deck before getting another methods
        self.remove_card("R♣") #remowe Queen of Clubs

    def create_deck(self):
        self.deck = self.clubs + self.diamonds + self.hearts + self.spades #adding every cards to creating deck

    def remove_card(self, card_str):
        for card in self.deck:
            if str(card) == card_str:
                self.deck.remove(card) #remove a spesific card from deck
                break

    def shuffle(self): #shuffle the deck randomly for seed(...) value
        shuffle(self.deck)
        return self.deck

    def distribute(self, players): #distribute cards to players step by step
        player_index = 0 #starting from first player

        while self.deck: #works until no card left in the deck.
            card = self.deck.pop(0) #take the first card from deck
            players[player_index].players_hand.append(card) #add distributed card to current player's hand
            player_index = (player_index + 1) % len(players) #pass to the next player


#representing each player in the game
class Player:
    def __init__(self, name): # Initialize a player with a name
        self.name = name
        self.players_hand = [] #at the beginning, no player has any cards

    def __str__(self): #set how to see the player's hand
        hand_str = ", ".join(str(card) for card in self.players_hand)
        return f"{self.name}: {hand_str} ({len(self.players_hand)})"  #show players current hand(cards) and number of cards

    def __len__(self): #set how to see the player's number of cards
        return len(self.players_hand)


    def remove_pairs(self): #remove pair cards from a player's hand
        value_count = Counter() #count to know which cards are pair.
        for card in self.players_hand:
            value_count[card.value] += 1 #adding +1 to if same card's has same value. ex:  player has = A♠:, 2♦, A♥, 2♠, 3♣ --> A:2times, 2:2times, 3:1times

        new_hand = []
        for card in self.players_hand:
            if value_count[card.value] % 2 == 1 or value_count[card.value] == 3: #checking for non-pairs. ex for upper exemple our non-pairs cards: 3
                new_hand.append(card) #addingg odd cards to new_hand list

        self.players_hand = new_hand #now player's hand is consists just non-pairs cards.

    def draw_card(self, from_player):  #draw(select) a card from the target player's hand
        if len(from_player.players_hand) > 0: #if target player has any card
            selected_card = choice(from_player.players_hand) #randomly select a card to draw
            from_player.players_hand.remove(selected_card) #remove the selected card from target player
            self.players_hand.append(selected_card) #add the drawn card to current player's hand
            self.remove_pairs() #remove pairs from currentplayer's hand because we adding drawn card.
            print(f"{self.name} draws from {from_player.name}: {selected_card}") #printing which players drawn which card from which player.
            print(f"{from_player.name}'s updated hand: {from_player}") #printing target player's who lose a drawn card updated hand
            print("\nCurrent hands:")
            for player in players:
                print(player) #printing all players's currend hands

    def has_cards(self):
        return len(self.players_hand) > 0 #check if player has any cards


#game class to manage the flow of the game
class Game:
    def __init__(self, players): #initialize the game with a list of players
        self.players = players
        self.deck = Deck() #create the deck
        self.start_game() #start the game

    def start_game(self):
        seed(42) #Same randomness for the entire game.
        print("Initial deck:")
        for card in self.deck.deck:
            print(str(card), end=', ')
        print(f"\nDeck size: {len(self.deck.deck)}\n") #printing initialized deck and it's length(number of cards)

        self.deck.shuffle()
        print("Shuffled deck:")
        for card in self.deck.deck:
            print(str(card), end=', ')
        print(f"\nDeck size: {len(self.deck.deck)}\n") #shuffuling deck, printing deck and it's length(umber of cards)

        self.deck.distribute(self.players)
        print("Distributed hands:")
        for player in self.players:
            print(player) #distribute cards to players and printing distributed hands

        for player in self.players:
            player.remove_pairs() #removing pairs
        print("\nHands after removing pairs:")
        for player in self.players:
            print(player)  #printing after removing hands

        print("\nGame starts!")
        self.play() #starts game loop

    def play(self):
        while len(self.players) > 1: #checking for any players remains. in the other words check if any player left
            current_player = self.players[0] #setting current player who is will choose card from next player
            next_player = self.players[1] #setting next player. this system works like this: current:player1, next:player2 , current:player2, next:player3,...
            print(f"\n{current_player.name}'s turn:")
            current_player.draw_card(next_player) #curret player drawn card from next player

            new_player_list = []
            for player in self.players:
                if player.has_cards():
                    new_player_list.append(player) #adding players to new list if player has any card

            self.players = new_player_list #setting current player list to new list

            first_player = self.players.pop(0) #remowing first player. this will update first player to make every player play
            self.players.append(first_player) #adding first player to end of platyers list. ex: curretn:[player1, player2, player3, player4] --> after pop first player to end: [player2, player3, player4, player1]

        print(f"\nGame over! {self.players[0].name} loses.") #printing if just one player left in player list



players = []

for i in range(4): #4: players number
  players.append(Player(f"Player {i+1}")) #we use i+1 because i starts from 0. ex: i = 0,1,2,3 -> 1,2,3,4 if you dot want this use range(1,5)

print("Setting up the game...")
game = Game(players) #starting game