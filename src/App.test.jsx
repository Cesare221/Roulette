import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adiciona uma nova opção e evita duplicadas', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('decision-maker:options-v1', JSON.stringify(['Pizza', 'Sushi']))

    render(<App />)

    const input = screen.getByLabelText(/nova opção/i)
    await user.type(input, 'Sorvete')
    await user.click(screen.getByRole('button', { name: /adicionar opção/i }))

    expect(screen.getByText('Sorvete', { selector: '.option-text' })).toBeInTheDocument()
    expect(screen.getAllByText(/opção adicionada/i).length).toBeGreaterThan(0)

    await user.clear(input)
    await user.type(input, 'Pizza')
    await user.click(screen.getByRole('button', { name: /adicionar opção/i }))

    expect(screen.getAllByText(/já existe na lista/i).length).toBeGreaterThan(0)
  })

  it('importa opções a partir de texto e separadores alternativos', async () => {
    const user = userEvent.setup()

    render(<App />)

    const textarea = screen.getByPlaceholderText(/uma opção por linha/i)
    await user.type(textarea, 'Café;Chá')
    await user.click(screen.getByRole('button', { name: /importar/i }))

    expect(screen.getByText('Café', { selector: '.option-text' })).toBeInTheDocument()
    expect(screen.getByText('Chá', { selector: '.option-text' })).toBeInTheDocument()
    expect(screen.getAllByText(/importadas 2 opções/i).length).toBeGreaterThan(0)
  })

  it('gira a roleta e registra o resultado no histórico', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') {
        callback()
      }
      return 0
    })
    vi.spyOn(window, 'clearTimeout').mockImplementation(() => {})
    window.localStorage.setItem('decision-maker:options-v1', JSON.stringify(['A', 'B']))

    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /girar a roleta/i }))

    expect(screen.getByText(/resultado/i)).toBeInTheDocument()
    expect(screen.getByText('A', { selector: '.result-value' })).toBeInTheDocument()
    expect(screen.getByText('Histórico', { selector: '.section-label' })).toBeInTheDocument()
  }, 15000)
})
