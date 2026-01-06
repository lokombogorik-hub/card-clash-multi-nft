import { create } from 'zustand'
import { io } from 'socket.io-client'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const useGameStore = create((set, get) => ({
    // Состояние игры
    gameId: null,
    board: Array(3).fill(null).map(() => Array(3).fill(null)),
    players: [{}, {}],
    currentPlayer: 0,
    scores: [0, 0],
    turnCount: 0,
    gameStatus: 'waiting', // waiting, active, finished

    // Карты игрока
    hand: [],
    deck: [],
    selectedCard: null,

    // WebSocket
    socket: null,
    isConnected: false,

    // Действия
    initializeGame: async (gameId) => {
        try {
            const response = await axios.get(`${API_URL}/api/game/status/${gameId}`)
            const gameData = response.data

            set({
                gameId,
                board: gameData.board?.grid || Array(3).fill(null).map(() => Array(3).fill(null)),
                players: gameData.players || [{}, {}],
                currentPlayer: gameData.current_player || 0,
                scores: gameData.scores || [0, 0],
                gameStatus: gameData.status || 'waiting'
            })

            // Подключаем WebSocket
            get().connectWebSocket(gameId)
        } catch (error) {
            console.error('Ошибка инициализации игры:', error)
        }
    },

    connectWebSocket: (gameId) => {
        const socket = io(API_URL, {
            path: '/ws',
            query: { gameId, playerId: localStorage.getItem('walletAddress') }
        })

        socket.on('connect', () => {
            console.log('✅ Подключено к игровому серверу')
            set({ socket, isConnected: true })
        })

        socket.on('game_update', (data) => {
            set({
                board: data.game_state.board?.grid || get().board,
                currentPlayer: data.game_state.current_player || get().currentPlayer,
                scores: data.game_state.scores || get().scores,
                turnCount: data.game_state.turn_count || get().turnCount
            })
        })

        socket.on('game_end', (data) => {
            set({ gameStatus: 'finished' })
            // Показать результат игры
        })

        socket.on('disconnect', () => {
            console.log('❌ Отключено от игрового сервера')
            set({ isConnected: false })
        })

        set({ socket })
    },

    selectCard: (card) => {
        set({ selectedCard: card })
    },

    placeCard: (row, col, card) => {
        const { socket, gameId, hand } = get()

        if (socket) {
            socket.emit('game_action', {
                type: 'game_action',
                action: 'place_card',
                card,
                row,
                col
            })

            // Убираем карту из руки
            set({
                hand: hand.filter(c => c.id !== card.id),
                selectedCard: null
            })
        }
    },

    endTurn: () => {
        const { socket } = get()
        if (socket) {
            socket.emit('game_action', {
                type: 'game_action',
                action: 'end_turn'
            })
        }
    },

    surrender: () => {
        const { socket } = get()
        if (socket) {
            socket.emit('game_action', {
                type: 'game_action',
                action: 'surrender'
            })
        }
    },

    joinQueue: async (deckId) => {
        try {
            const walletAddress = localStorage.getItem('walletAddress')
            const response = await axios.post(`${API_URL}/api/game/queue`, {
                walletAddress,
                deckId
            })

            if (response.data.success) {
                // Ожидание матча
                const checkInterval = setInterval(async () => {
                    const gameId = localStorage.getItem('currentGameId')
                    if (gameId) {
                        clearInterval(checkInterval)
                        get().initializeGame(gameId)
                    }
                }, 1000)
            }
        } catch (error) {
            console.error('Ошибка входа в очередь:', error)
        }
    },

    loadPlayerCards: async () => {
        try {
            const walletAddress = localStorage.getItem('walletAddress')
            const response = await axios.get(`${API_URL}/api/users/${walletAddress}/cards`)

            set({ deck: response.data })

            // Берем первые 5 карт в руку
            set({ hand: response.data.slice(0, 5) })
        } catch (error) {
            console.error('Ошибка загрузки карт:', error)
        }
    },

    disconnect: () => {
        const { socket } = get()
        if (socket) {
            socket.disconnect()
        }
        set({
            socket: null,
            isConnected: false,
            gameId: null,
            gameStatus: 'waiting'
        })
    }
}))