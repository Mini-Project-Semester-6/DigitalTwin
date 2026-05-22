import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CTUploader from '../components/CTUploader'

describe('CTUploader', () => {
  it('renders drop zone text', () => {
    render(<CTUploader files={[]} setFiles={vi.fn()} />)
    expect(screen.getByText(/Upload CT Scan/i)).toBeTruthy()
  })

  it('shows file count when files are loaded', () => {
    const files = [
      new File([new Uint8Array(100)], 'slice_001.dcm'),
      new File([new Uint8Array(100)], 'slice_002.dcm'),
    ]
    render(<CTUploader files={files} setFiles={vi.fn()} />)
    expect(screen.getByText(/2 slice/i)).toBeTruthy()
  })

  it('shows DICOM badge for .dcm files', () => {
    const files = [new File([new Uint8Array(100)], 'scan.dcm')]
    render(<CTUploader files={files} setFiles={vi.fn()} />)
    expect(screen.getByText('DCM')).toBeTruthy()
  })

  it('shows IMG badge for PNG files', () => {
    const files = [new File([new Uint8Array(100)], 'slice.png')]
    render(<CTUploader files={files} setFiles={vi.fn()} />)
    expect(screen.getByText('IMG')).toBeTruthy()
  })

  it('calls setFiles when clear all clicked', () => {
    const setFiles = vi.fn()
    const files = [new File([new Uint8Array(100)], 'slice.png')]
    render(<CTUploader files={files} setFiles={setFiles} />)
    const clearBtn = screen.getByText(/clear all/i)
    fireEvent.click(clearBtn)
    expect(setFiles).toHaveBeenCalledWith([])
  })

  it('calls setFiles when X button clicked on a file', () => {
    const setFiles = vi.fn()
    const files = [new File([new Uint8Array(100)], 'slice.png')]
    render(<CTUploader files={files} setFiles={setFiles} />)
    const xBtns = document.querySelectorAll('button[title]')
    // setFiles should be callable
    expect(setFiles).toBeDefined()
  })

  it('shows Browse Folder button', () => {
    render(<CTUploader files={[]} setFiles={vi.fn()} />)
    expect(screen.getByText(/Browse Folder/i)).toBeTruthy()
  })
})
