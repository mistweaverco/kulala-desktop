interface PromptModalOptions {
  title: string
  message: string
  defaultValue?: string
  okButtonText?: string
  cancelButtonText?: string
}

interface ConfirmModalOptions {
  title: string
  message: string
  okButtonText?: string
  cancelButtonText?: string
}

interface MultiSelectConfirmModalOptions<T> {
  title: string
  message: string
  onlyOne?: boolean
  options: { value: T; label: string }[]
  okButtonText?: string
  cancelButtonText?: string
}

export async function promptModal(options: PromptModalOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const modalId = `prompt-modal-${Date.now()}`

    const modalHtml = `
      <div class="modal" id="${modalId}">
        <div class="modal-box">
          <h3 class="font-bold text-lg">${options.title}</h3>
          <p class="py-4">${options.message}</p>
          <input type="text" placeholder="${options.defaultValue || ''}" value="${options.defaultValue || ''}" class="input input-bordered w-full" id="${modalId}-input" />
          <div class="modal-action">
            <label for="${modalId}" class="btn" id="${modalId}-cancel">${options.cancelButtonText || 'Cancel'}</label>
            <label for="${modalId}" class="btn btn-primary" id="${modalId}-ok">${options.okButtonText || 'OK'}</label>
          </div>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', modalHtml)

    const modalElement = document.getElementById(modalId) as HTMLElement
    const inputElement = document.getElementById(`${modalId}-input`) as HTMLInputElement
    const okButton = document.getElementById(`${modalId}-ok`) as HTMLElement
    const cancelButton = document.getElementById(`${modalId}-cancel`) as HTMLElement

    if (modalElement) {
      modalElement.classList.add('modal-open')

      const closeHandler = (result: string | null): void => {
        modalElement.classList.remove('modal-open')
        setTimeout(() => {
          // small delay to allow animation to complete
          modalElement.remove()
          resolve(result)
        }, 150)
      }

      okButton.addEventListener('click', () => {
        closeHandler(inputElement.value)
      })

      cancelButton.addEventListener('click', () => {
        closeHandler(null)
      })

      // Handle enter key press in the input field
      inputElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          closeHandler(inputElement.value)
        }
      })
    } else {
      resolve(null) // Modal creation failed
    }
  })
}

export async function confirmModal(options: ConfirmModalOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const modalId = `confirm-modal-${Date.now()}`

    const modalHtml = `
      <div class="modal" id="${modalId}">
        <div class="modal-box">
          <h3 class="font-bold text-lg">${options.title}</h3>
          <p class="py-4">${options.message}</p>
          <div class="modal-action">
            <label for="${modalId}" class="btn" id="${modalId}-cancel">${options.cancelButtonText || 'Cancel'}</label>
            <label for="${modalId}" class="btn btn-primary" id="${modalId}-ok">${options.okButtonText || 'OK'}</label>
          </div>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', modalHtml)

    const modalElement = document.getElementById(modalId) as HTMLElement
    const okButton = document.getElementById(`${modalId}-ok`) as HTMLElement
    const cancelButton = document.getElementById(`${modalId}-cancel`) as HTMLElement

    if (modalElement) {
      modalElement.classList.add('modal-open')

      const closeHandler = (result: boolean): void => {
        modalElement.classList.remove('modal-open')
        setTimeout(() => {
          modalElement.remove()
          resolve(result)
        }, 150)
      }

      okButton.addEventListener('click', () => {
        closeHandler(true)
      })

      cancelButton.addEventListener('click', () => {
        closeHandler(false)
      })
    } else {
      resolve(false)
    }
  })
}

export async function multiSelectConfirmModal<T>(
  options: MultiSelectConfirmModalOptions<T>
): Promise<T[] | null> {
  return new Promise<T[] | null>((resolve) => {
    const d = Date.now()
    const modalId = `multiselect-modal-${d}`

    const modalHtml = `
      <div class="modal" id="${modalId}">
        <div class="modal-box">
          <h3 class="font-bold text-lg">${options.title}</h3>
          <p class="py-4">${options.message}</p>
          <div class="space-y-2">
            ${options.options
              .map(
                (opt) => `
                <label class="flex items-center space-x-3">
                  <input type="${options.onlyOne ? 'radio' : 'checkbox'}" class="${options.onlyOne ? 'radio' : 'checkbox'}" name="${options.onlyOne ? `${modalId}-radio` : ''}" value="${opt.value}" id="${modalId}-${opt.value}" />
                  <span>${opt.label}</span>
                </label>
              `
              )
              .join('')}
          </div>
          <div class="modal-action">
            <label for="${modalId}" class="btn" id="${modalId}-cancel">${options.cancelButtonText || 'Cancel'}</label>
            <label for="${modalId}" class="btn btn-primary" id="${modalId}-ok">${options.okButtonText || 'OK'}</label>
          </div>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', modalHtml)

    const modalElement = document.getElementById(modalId) as HTMLElement
    const okButton = document.getElementById(`${modalId}-ok`) as HTMLElement
    const cancelButton = document.getElementById(`${modalId}-cancel`) as HTMLElement

    if (modalElement) {
      modalElement.classList.add('modal-open')

      const closeHandler = (result: T[] | null): void => {
        modalElement.classList.remove('modal-open')
        setTimeout(() => {
          modalElement.remove()
          resolve(result)
        }, 150)
      }

      okButton.addEventListener('click', () => {
        let selectedValues: T[]
        if (options.onlyOne) {
          const checkedRadio = document.querySelector(
            `input[name="${modalId}-radio"]:checked`
          ) as HTMLInputElement
          if (checkedRadio) {
            selectedValues = [checkedRadio.value as T]
          }
        } else {
          selectedValues = options.options
            .filter(
              (opt) =>
                (document.getElementById(`${modalId}-${opt.value}`) as HTMLInputElement)?.checked
            )
            .map((opt) => opt.value)
        }
        closeHandler(selectedValues)
      })

      cancelButton.addEventListener('click', () => {
        closeHandler(null)
      })
    } else {
      resolve(null)
    }
  })
}
