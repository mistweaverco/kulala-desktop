<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
  import { VisibleTab } from './explorer/types'
  import { monaco } from './monaco'
  import { useCollections, useFiles } from '../stores'
  import type { OnSyntaxChangeHandler } from './explorer'
  import { createOnSyntaxChangeHandler, getActiveParsedDocument } from './explorer'
  import { NewResizer } from './explorer/resizer'
  import type {
    Header,
    RequestFormData,
    Block,
    Document
  } from '../../../main/parser/DocumentParser'
  import { sleeper } from './explorer/sleeper'
  import HeaderTabComponent from './explorer/HeaderTabComponent.svelte'
  import BodyTabComponent from './explorer/BodyTabComponent.svelte'
  import ScriptsTabComponent from './explorer/ScriptsTabComponent.svelte'
  import { promptModal, confirmModal, multiSelectConfirmModal } from './modals'
  import ResponseEditorComponent from './explorer/ResponseEditorComponent.svelte'

  let collections = useCollections()
  let files = useFiles()

  let editor: Monaco.editor.IStandaloneCodeEditor
  let editorContainer: HTMLElement

  let graphqlVariablesEditor: Monaco.editor.IStandaloneCodeEditor
  let graphqlVariablesEditorContainer: HTMLElement

  let activeParsedDocument: Document
  let responseEditor: Monaco.editor.IStandaloneCodeEditor
  let responseEditorContainer: HTMLElement

  let visibleTab: VisibleTab
  let responseIsVisible = false
  let isEditorVisible = true
  let isEditorSyntaxVisible = true

  let isMultipartFormRequest = false
  let isSimpleFormRequest = false
  let isDocumentModelDirty = false
  let simpleFormRequestVariables: RequestFormData[] = []

  let loadingModal: HTMLDialogElement
  let requestBodyTypeSelect: HTMLSelectElement
  let requestMethodSelect: HTMLSelectElement
  let requestUrlInput: HTMLInputElement
  let containerLeftSection: HTMLElement

  let isLoading = false

  let collectionsSelectValue: string = ''
  let selectedFile = {
    name: '',
    filepath: ''
  }

  interface SelectedRequest {
    name: string
    block: Block | null
  }

  let selectedRequest: SelectedRequest = {
    name: '',
    block: null
  }

  const refreshFiles = async (): Promise<void> => {
    $files = await window.KulalaApi.getFilesByCollectionName(collectionsSelectValue)
  }

  const onCollectionsSelectChange = async (evt: Event): Promise<void> => {
    const target = evt.target as HTMLInputElement
    collectionsSelectValue = target.value
    refreshFiles()
  }

  const onCtrlEnterSendRequest = (e: KeyboardEvent): void => {
    if (e.ctrlKey && e.key === 'Enter') {
      sendRequest()
    }
  }

  const selectEnvironment = async (): Promise<void> => {
    const env = await multiSelectConfirmModal({
      title: 'Select environment',
      message: 'Select an environment to use',
      onlyOne: true,
      options: [
        {
          label: 'Development',
          value: 'development'
        },
        {
          label: 'Staging',
          value: 'staging'
        },
        {
          label: 'Production',
          value: 'production'
        }
      ]
    })
    console.log(env)
  }

  const resetSelectedFile = (): void => {
    selectedFile = {
      name: '',
      filepath: ''
    }
  }

  const closeCollections = (): void => {
    const openCollection = document.querySelector(
      '[name="collection-accordion"]:checked'
    ) as HTMLInputElement
    if (openCollection) openCollection.checked = false
  }

  const addFilesToCollection = async (): Promise<void> => {
    closeCollections()
    const collectionName = await promptModal({
      title: 'Add files to collection',
      message: 'Enter a name for the collection'
    })
    if (collectionName) {
      collectionsSelectValue = collectionName
      await addFiles()
    }
  }

  const addFiles = async (): Promise<void> => {
    const confirmed = await multiSelectConfirmModal({
      title: 'Add files to collection',
      message: 'What do you want to do?',
      onlyOne: true,
      options: [
        {
          label: 'Create new file',
          value: 'create'
        },
        {
          label: 'Add existing file',
          value: 'add'
        }
      ]
    })
    if (confirmed && confirmed.includes('add')) {
      await window.KulalaApi.pickFiles(collectionsSelectValue)
      activeParsedDocument = null
      $collections = await window.KulalaApi.getCollectionNames()
      await refreshFiles()
      resetSelectedFile()
    }
    if (confirmed && confirmed.includes('create')) {
      await window.KulalaApi.createFile(collectionsSelectValue)
      await refreshFiles()
    }
  }

  const editFilename = async (): Promise<void> => {
    const newFilename = await promptModal({
      title: 'Edit filename',
      message: 'Enter a new name for the file',
      defaultValue: selectedFile.name
    })
    if (newFilename) {
      await window.KulalaApi.renameFile(selectedFile.filepath, newFilename)
      $files = await window.KulalaApi.getFilesByCollectionName(collectionsSelectValue)
    }
  }

  const editBlockName = async (): Promise<void> => {
    const newBlockName = await promptModal({
      title: 'Edit block name',
      message: 'Enter a new name for the block',
      defaultValue: selectedRequest.name
    })
    if (newBlockName) {
      selectedRequest.name = newBlockName
      activeParsedDocument.blocks.forEach((block) => {
        if (block === selectedRequest.block) {
          block.requestSeparator.text = newBlockName
        }
      })
      isDocumentModelDirty = true
    }
  }

  const setValuesBasedOnBlock = (block: Block): void => {
    const hasSimpleFormHeader =
      getHeaderByKey('content-type') === 'application/x-www-form-urlencoded'
    requestMethodSelect.value = block.request.method
    requestUrlInput.value = block.request.url
    const body = block.request.body?.trim() || ''
    if (block.request.multipartFormData) {
      isMultipartFormRequest = true
      isSimpleFormRequest = false
      isEditorSyntaxVisible = false
      isEditorVisible = false
      isEditorSyntaxVisible = false
      requestBodyTypeSelect.value = 'form-data'
    } else if (hasSimpleFormHeader) {
      isMultipartFormRequest = false
      isSimpleFormRequest = true
      isEditorSyntaxVisible = false
      requestBodyTypeSelect.value = 'x-www-form-urlencoded'
      simpleFormRequestVariables = []
      isEditorVisible = false
      isEditorSyntaxVisible = false
      selectedRequest.block.request.body
        .trim()
        .replace(/\n/g, '')
        .split('&')
        .forEach((pair: string) => {
          let [key, value] = pair.split('=')
          value = pair.slice(pair.indexOf('=') + 1)
          value = decodeURIComponent(value)
          simpleFormRequestVariables.push({
            key,
            value
          })
        })
    } else {
      if (body.length === 0) {
        requestBodyTypeSelect.value = 'none'
        isEditorSyntaxVisible = false
        isEditorVisible = false
      } else {
        requestBodyTypeSelect.value = 'raw'
        isEditorVisible = true
        isEditorSyntaxVisible = true
      }
      isMultipartFormRequest = false
      isSimpleFormRequest = false
    }
    editor.setValue(body)
  }

  let abortController: AbortController

  const clearResponse = (): void => {
    responseIsVisible = false
    responseEditor.setValue('')
  }

  const processResponse = (data: string): void => {
    const trimmedData = data.trim()
    if (trimmedData.startsWith('{') || trimmedData.startsWith('[')) {
      try {
        const parsedData = JSON.parse(trimmedData)
        responseEditor.setModel(
          monaco.editor.createModel(JSON.stringify(parsedData, null, 2), 'json')
        )
      } catch (err) {
        responseEditor.setModel(monaco.editor.createModel(data, 'text'))
      }
    } else if (trimmedData.startsWith('<')) {
      responseEditor.setModel(monaco.editor.createModel(data, 'html'))
    } else {
      responseEditor.setModel(monaco.editor.createModel(data, 'text'))
    }
    responseIsVisible = true
    setTimeout(() => {
      responseEditor.layout()
    }, 500)
  }

  interface GraphQLData {
    query: string
    variables: unknown
  }

  const getRequestBody = (): string | GraphQLData => {
    switch (requestBodyTypeSelect.value) {
      case 'form-data':
      case 'x-www-form-urlencoded':
      case 'raw':
        return editor.getValue()
      case 'GraphQL':
        return {
          query: editor.getValue(),
          variables: graphqlVariablesEditor.getValue().trim().length > 0 ? graphqlVariablesEditor.getValue() : {}
        }
      case 'binary':
      case 'none':
      default:
        return undefined
    }
  }

  /**
   * Get header value by key case insensitive way
   */
  const getHeaderByKey = (key: string): string => {
    return selectedRequest.block.request.headers.find(
      (header: Header) => header.key.toLowerCase() === key.toLowerCase()
    )?.value
  }

  const setHeaderKeyValue = (key: string, value: string): void => {
    const existingHeader = selectedRequest.block.request.headers.find(
      (header: Header) => header.key.toLowerCase() === key.toLowerCase()
    )
    if (existingHeader) {
      existingHeader.value = value
    } else {
      selectedRequest.block.request.headers.push({ key, value } as Header)
    }
    updateDocumentModel('headers', selectedRequest.block.request.headers)
  }

  const sendRequest = async (): Promise<void> => {
    clearResponse()
    isLoading = true
    const requestBody = getRequestBody()
    const block = {
      ...selectedRequest.block,
      request: {
        ...selectedRequest.block.request,
        body: requestBody
      }
    }

    const res = await window.KulalaApi.sendRequest(
      block
    )
    // TODO: show error modal
    if (!res || !res.responseBody) {
      isLoading = false
      return
    }
    processResponse(res.responseBody)
    isLoading = false
  }

  const abortRequest = (): void => {
    abortController.abort('Request aborted by user')
  }
  const onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey && e.key === 's') {
      saveDocumentModel()
    }
    if (e.ctrlKey && e.key === 'Enter') {
      sendRequest()
    }
    if (isLoading && e.key === 'Escape') {
      abortRequest()
    }
  }

  const changeTab = (e: Event): void => {
    const target = e.target as HTMLButtonElement
    const parent = target.parentElement as HTMLElement
    parent.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.remove('tab-active')
    })
    target.classList.add('tab-active')
    const tab = target.dataset.type as VisibleTab
    visibleTab = tab
  }

  const restoreSession = async (): Promise<void> => {
    loadingModal.showModal()
    // TODO: implement a better way than sleep
    visibleTab = VisibleTab.body
    await sleeper(500)
    layoutEditors()
    const session = await window.KulalaApi.getSession()
    const coll = document.querySelector(
      `input[name="collection-accordion"][value="${session.activeCollectionName}"]`
    ) as HTMLInputElement
    if (coll) {
      coll.click()
      await sleeper(500)
      const file = document.querySelector(
        `input[name="collection-file-accordion"][data-filepath="${session.activeFileFilepath}"]`
      ) as HTMLInputElement
      if (file) {
        file.click()
        await sleeper(500)
        const req = document.querySelector(
          `button[data-idx="${session.activeRequestIdx}"]`
        ) as HTMLButtonElement
        if (req) {
          req.click()
        }
      }
    }
    loadingModal.close()
  }

  const addRequest = (): void => {
    const block: Block = {
      requestSeparator: {
        text: 'New request ' + (activeParsedDocument.blocks.length + 1)
      },
      metadata: [],
      comments: [],
      preRequestScripts: [],
      postRequestScripts: [],
      responseRedirect: null,
      request: {
        method: 'GET',
        url: '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        body: '',
        multipartFormData: null
      }
    }
    const idx = activeParsedDocument.blocks.indexOf(selectedRequest.block)
    activeParsedDocument.blocks.splice(idx + 1, 0, block)
    activeParsedDocument.blocks = [...activeParsedDocument.blocks]
    isDocumentModelDirty = true
  }

  const removeRequest = (): void => {
    if (!selectedRequest.block) {
      return
    }
    const idx = activeParsedDocument.blocks.indexOf(selectedRequest.block)
    activeParsedDocument.blocks.splice(idx, 1)
    activeParsedDocument.blocks = [...activeParsedDocument.blocks]
    selectedRequest.block = null
    selectedRequest.name = ''
    isDocumentModelDirty = true
  }

  const renameFile = async (): Promise<void> => {
    const newFilename = await promptModal({
      title: 'Rename file',
      message: 'Enter a new name for the file',
      defaultValue: selectedFile.name
    })
    window.KulalaApi.renameFile(selectedFile.filepath)
  }

  const renameCollection = async (): Promise<void> => {
    const newCollectionName = await promptModal({
      title: 'Rename collection',
      message: 'Enter a new name for the collection',
      defaultValue: collectionsSelectValue
    })

    if (!newCollectionName) {
      return
    }

    console.log(newCollectionName)

    // window.KulalaApi.renameCollection(collectionsSelectValue, newCollectionName)
  }

  const layoutEditors = (): void => {
    editor?.layout()
    responseEditor?.layout()
  }

  onMount(async () => {
    $collections = await window.KulalaApi.getCollectionNames()
    document.addEventListener('keydown', onDocumentKeyDown)

    window.addEventListener('resize', layoutEditors)
    const layout = await window.KulalaApi.getLayout()
    NewResizer({
      container: containerLeftSection,
      width: true,
      height: false,
      minWidth: 320,
      onResize: () => {
        layoutEditors()
      },
      onResizeEnd: (w) => {
        window.KulalaApi.saveLayout({
          leftSectionWidth: w
        })
      }
    })
    containerLeftSection.style.width = layout.leftSectionWidth + 'px'
    await restoreSession()
  })

  onDestroy(() => {
    monaco?.editor.getModels().forEach((model) => model.dispose())
    editor?.dispose()
  })

  type UpdateDocumentModelNodeType =
    | 'requestURL'
    | 'requestMethod'
    | 'requestHTTPVersion'
    | 'headers'
    | 'body'
    | 'multipartFormData'
    | 'simpleFormData'
  type UpdateDocumentModelNodeValue = string | Header[] | RequestFormData[]

  const updateDocumentModel = (
    nodeType: UpdateDocumentModelNodeType,
    nodeValue: UpdateDocumentModelNodeValue
  ): void => {
    if (!activeParsedDocument || !selectedRequest.block) {
      return
    }
    isDocumentModelDirty = true
    switch (nodeType) {
      case 'requestMethod':
        activeParsedDocument.blocks.forEach((block) => {
          if (block === selectedRequest.block) {
            block.request.method = nodeValue as string
          }
        })
        break
      case 'requestURL':
        activeParsedDocument.blocks.forEach((block) => {
          if (block === selectedRequest.block) {
            block.request.url = nodeValue as string
          }
        })
        break
      case 'requestHTTPVersion':
        activeParsedDocument.blocks.forEach((block) => {
          if (block === selectedRequest.block) {
            block.request.httpVersion = nodeValue as string
          }
        })
        break
      case 'headers':
        activeParsedDocument.blocks.forEach((block) => {
          if (block === selectedRequest.block) {
            block.request.headers = nodeValue as Header[]
          }
        })
        break
      case 'body':
        activeParsedDocument.blocks.forEach((block) => {
          if (block === selectedRequest.block) {
            block.request.body = nodeValue as string
          }
        })
        break
      case 'multipartFormData':
        activeParsedDocument.blocks.forEach((block) => {
          if (block === selectedRequest.block) {
            block.request.multipartFormData = nodeValue as RequestFormData[]
          }
        })
        break
      case 'simpleFormData':
        activeParsedDocument.blocks.forEach((block) => {
          if (block === selectedRequest.block) {
            block.request.body = nodeValue as string
          }
        })
        break
      default:
        break
    }
  }

  const onRequestUrlChange = (e: Event): void => {
    const target = e.target as HTMLInputElement
    updateDocumentModel('requestURL', target.value)
  }

  const onRequestMethodChange = (e: Event): void => {
    const target = e.target as HTMLInputElement
    updateDocumentModel('requestMethod', target.value)
  }

  const onRequestBodyTypeSelectChange = (e: Event): void => {
    const target = e.target as HTMLSelectElement
    switch (target.value) {
      case 'form-data':
        isMultipartFormRequest = true
        isSimpleFormRequest = false
        isEditorVisible = false
        isEditorSyntaxVisible = false
        setHeaderKeyValue(
          'content-type',
          'multipart/form-data; boundary=----KulalaBoundary'
        )
        setValuesBasedOnBlock(selectedRequest.block)
        break
      case 'x-www-form-urlencoded':
        isMultipartFormRequest = false
        isSimpleFormRequest = true
        isEditorVisible = false
        isEditorSyntaxVisible = false
        setHeaderKeyValue(
          'content-type',
          'application/x-www-form-urlencoded'
        )
        setValuesBasedOnBlock(selectedRequest.block)
        break
      case 'raw':
        isMultipartFormRequest = false
        isSimpleFormRequest = false
        isEditorVisible = true
        isEditorSyntaxVisible = true
        editor.setModel(monaco.editor.createModel(editor.getValue(), requestBodyTypeSelect.value))
        break
      case 'binary':
        isMultipartFormRequest = false
        isSimpleFormRequest = false
        isEditorVisible = false
        isEditorSyntaxVisible = false
        break
      case 'graphql':
        isMultipartFormRequest = false
        isSimpleFormRequest = false
        isEditorVisible = true
        isEditorSyntaxVisible = false
        editor.setModel(monaco.editor.createModel(editor.getValue(), 'graphql'))
        break
      case 'none':
        isMultipartFormRequest = false
        isSimpleFormRequest = false
        isEditorVisible = false
        isEditorSyntaxVisible = false
        break
      default:
        isMultipartFormRequest = false
        isSimpleFormRequest = false
        isEditorVisible = false
        isEditorSyntaxVisible = false
        break
    }
  }

  const onMultipartFormDataChange = (e?: Event | undefined): void => {
    let activeBlockIdx = 0
    if (e) {
      const target = e.target as HTMLInputElement
      const root = target.closest('[data-multipart-form-data-item]') as HTMLDivElement
      const key = root.querySelector('[name="multipart-form-data-item-key"]') as HTMLInputElement
      const value = root.querySelector(
        '[name="multipart-form-data-item-value"]'
      ) as HTMLInputElement
      const type = root.querySelector('[name="multipart-form-data-item-type"]') as HTMLSelectElement
      const inputIdx = parseInt(root.dataset.idx, 10)

      activeParsedDocument.blocks.forEach((block, idx) => {
        if (block === selectedRequest.block) {
          block.request.multipartFormData[inputIdx] = {
            key: key.value,
            value: value.value,
            type: type.value as 'text' | 'file'
          }
          activeBlockIdx = idx
        }
      })
    }

    updateDocumentModel(
      'multipartFormData',
      activeParsedDocument.blocks[activeBlockIdx].request.multipartFormData
    )
  }

  const addMultipartFormDataItem = (): void => {
    if (!selectedRequest.block.request.multipartFormData) {
      selectedRequest.block.request.multipartFormData = []
    }
    selectedRequest.block.request.multipartFormData.push({
      key: '',
      value: ''
    })
    selectedRequest.block.request.multipartFormData = [
      ...selectedRequest.block.request.multipartFormData
    ]
    onMultipartFormDataChange()
  }

  const removeMultipartFormDataItem = (e: MouseEvent): void => {
    const target = e.target as HTMLButtonElement
    const root = target.closest('[data-multipart-form-data-item]') as HTMLDivElement
    const idx = parseInt(root.dataset.idx, 10)
    selectedRequest.block.request.multipartFormData.splice(idx, 1)
    selectedRequest.block.request.multipartFormData = [
      ...selectedRequest.block.request.multipartFormData
    ]
    onMultipartFormDataChange()
  }

  const onSimpleFormDataChange = (e?: Event | undefined): void => {
    let body = ''
    let idx = 0

    if (e) {
      const target = e.target as HTMLInputElement
      const root = target.closest('[data-simple-form-data-item]') as HTMLDivElement
      const key = root.querySelector('[name="simple-form-data-key"]') as HTMLInputElement
      const value = root.querySelector('[name="simple-form-data-value"]') as HTMLInputElement
      const inputIdx = parseInt(root.dataset.idx, 10)

      simpleFormRequestVariables[inputIdx] = {
        key: key.value,
        value: value.value
      }
    }

    simpleFormRequestVariables.forEach((item) => {
      if (item.key === '') {
        return
      }
      if (idx > 0) {
        body += '&\n'
      }
      body += `${item.key}=${encodeURIComponent(item.value)}`
      idx++
    })

    simpleFormRequestVariables = [...simpleFormRequestVariables]

    updateDocumentModel('simpleFormData', body)
  }

  const addSimpleFormDataItem = (): void => {
    simpleFormRequestVariables.push({
      key: '',
      value: ''
    })
    simpleFormRequestVariables = [...simpleFormRequestVariables]
    onSimpleFormDataChange()
  }

  const removeSimpleFormDataItem = (e: MouseEvent): void => {
    const target = e.target as HTMLButtonElement
    const root = target.closest('[data-simple-form-data-item]') as HTMLDivElement
    const idx = parseInt(root.dataset.idx, 10)
    simpleFormRequestVariables.splice(idx, 1)
    simpleFormRequestVariables = [...simpleFormRequestVariables]
    onSimpleFormDataChange()
  }

  const onHeaderDataChange = (e?: Event | undefined): void => {
    if (e) {
      const target = e.target as HTMLInputElement
      const root = target.closest('[data-header-data-item]') as HTMLDivElement
      const key = root.querySelector('[name="header-data-key"]') as HTMLInputElement
      const value = root.querySelector('[name="header-data-value"]') as HTMLInputElement
      const idx = parseInt(root.dataset.idx, 10)
      selectedRequest.block.request.headers[idx] = {
        key: key.value,
        value: value.value
      }
    }
    updateDocumentModel('headers', selectedRequest.block.request.headers)
  }

  const addHeaderDataItem = (): void => {
    selectedRequest.block.request.headers.push({
      key: '',
      value: ''
    })
    selectedRequest.block.request.headers = [...selectedRequest.block.request.headers]
    onHeaderDataChange()
  }

  const removeHeaderDataItem = (e: MouseEvent): void => {
    const target = e.target as HTMLButtonElement
    const root = target.closest('[data-header-data-item]') as HTMLDivElement
    const idx = parseInt(root.dataset.idx, 10)
    selectedRequest.block.request.headers.splice(idx, 1)
    selectedRequest.block.request.headers = [...selectedRequest.block.request.headers]
    onHeaderDataChange()
  }

  let onRawSyntaxSelectChange: OnSyntaxChangeHandler

  const onRequestClick = async (evt: MouseEvent): Promise<void> => {
    const target = evt.target as HTMLButtonElement
    const btn = target.closest('button')
    const idx = parseInt(btn.dataset.idx, 10)
    const block = activeParsedDocument.blocks[idx]
    // if already active, make inactive
    if (selectedRequest.block === block) {
      selectedRequest.block = null
      selectedRequest.name = ''
      await window.KulalaApi.saveSession({
        activeCollectionName: null,
        activeFileFilepath: null,
        activeRequestIdx: null
      })
      return
    }
    if (block) {
      responseIsVisible = false
      selectedRequest.name = block.requestSeparator.text || `Request ${idx + 1}`
      selectedRequest.block = block
      await window.KulalaApi.saveSession({
        activeCollectionName: collectionsSelectValue,
        activeFileFilepath: selectedFile.filepath,
        activeRequestIdx: idx
      })
      setValuesBasedOnBlock(block)
      isDocumentModelDirty = false
    }
  }

  const saveDocumentModel = async (): Promise<void> => {
    if (!activeParsedDocument) {
      return
    }
    isLoading = true
    await window.KulalaApi.saveDocumentModel(activeParsedDocument, selectedFile.filepath)
    activeParsedDocument = await getActiveParsedDocument(selectedFile.filepath)
    isDocumentModelDirty = false
    isLoading = false
  }

  const removeFile = async (): Promise<void> => {
    const confirmed = await multiSelectConfirmModal({
      title: 'Delete or remove file',
      message: 'What do you want to do with the file?',
      onlyOne: true,
      options: [
        {
          label: 'Remove from collection',
          value: 'remove'
        },
        {
          label: 'Delete file',
          value: 'delete'
        }
      ]
    })
    if (confirmed && confirmed.includes('remove')) {
      await window.KulalaApi.removeFileFromCollection(collectionsSelectValue, selectedFile.filepath)
      $collections = await window.KulalaApi.getCollectionNames()
      await refreshFiles()
      activeParsedDocument = null
    }
    if (confirmed && confirmed.includes('delete')) {
      await confirmModal({
        title: 'Not implemented',
        message: 'This feature is not implemented yet.'
      })
    }
  }

  const removeCollection = async (): Promise<void> => {
    const confirmed = await multiSelectConfirmModal({
      title: 'Delete or remove collection',
      message: 'What do you want to do with the collection?',
      onlyOne: true,
      options: [
        {
          label: 'Remove collection',
          value: 'remove'
        },
        {
          label: 'Remove collection and delete files',
          value: 'delete'
        }
      ]
    })
    if (confirmed && confirmed.includes('remove')) {
      await window.KulalaApi.removeCollection(collectionsSelectValue)
      await refreshFiles()
      $collections = await window.KulalaApi.getCollectionNames()
    }
    if (confirmed && confirmed.includes('delete')) {
      await confirmModal({
        title: 'Not implemented',
        message: 'This feature is not implemented yet.'
      })
    }
  }

  const onFileClick = async (evt: MouseEvent): Promise<void> => {
    const target = evt.target as HTMLInputElement
    const filename = target.dataset.filename
    const filepath = target.dataset.filepath
    selectedFile.name = filename
    selectedFile.filepath = filepath
    activeParsedDocument = await getActiveParsedDocument(filepath)
  }

  $: if (loadingModal) isLoading ? loadingModal.showModal() : loadingModal.close()
  $: if (editor) {
    onRawSyntaxSelectChange = createOnSyntaxChangeHandler(editor, setHeaderKeyValue)
  }
</script>

<dialog class="modal" bind:this={loadingModal}>
  <div class="modal-box w-fit">
    <span class="loading loading-xl loading-spinner text-secondary"></span>
  </div>
</dialog>

<div class="join w-full">
  <div
    class="relative join-item ui-resizable ui-resizable-width p-5"
    bind:this={containerLeftSection}
  >
    <div>
      <div class="mb-5 text-center">
        <ul class="menu menu-horizontal rounded-box">
          <li>
            <button class="tooltip" on:click={addFilesToCollection} data-tip="Add collection">
              <span class="icon">
                <i class="fa fa-plus"></i>
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div class="field">
        {#each $collections as collectionName}
          <div class="collapse collapse-arrow bg-base-100 border border-base-300 mb-5">
            <input
              type="radio"
              name="collection-accordion"
              value={collectionName}
              on:change={onCollectionsSelectChange}
            />
            <div class="collapse-title font-semibold">
              <span>{collectionName}</span>
            </div>
            <div class="collapse-content text-sm">
              {#if collectionsSelectValue === collectionName}
                <div class="mb-5 text-center">
                  <ul class="menu menu-horizontal rounded-box">
                    <li>
                      <button class="tooltip" on:click={addFiles} data-tip="Add files">
                        <span class="icon">
                          <i class="fa fa-plus"></i>
                        </span>
                      </button>
                    </li>
                    <li>
                      <button
                        class="tooltip"
                        on:click={renameCollection}
                        data-tip="Edit collection name"
                      >
                        <span class="icon">
                          <i class="fa fa-edit"></i>
                        </span>
                      </button>
                    </li>
                    <li>
                      <button
                        class="tooltip"
                        data-tip="Delete this collection"
                        on:click={removeCollection}
                      >
                        <span class="icon">
                          <i class="fa fa-trash"></i>
                        </span>
                      </button>
                    </li>
                  </ul>
                </div>
              {/if}
              {#each $files as file}
                <div class="collapse collapse-arrow bg-base-100 border border-base-300 mb-5">
                  <input
                    type="radio"
                    name="collection-file-accordion"
                    data-filename={file.name}
                    data-filepath={file.filepath}
                    on:click={onFileClick}
                  />
                  <div class="collapse-title font-semibold">
                    <span>{file.name}</span>
                  </div>
                  <div class="collapse-content text-sm">
                    {#if file.filepath === selectedFile.filepath}
                      <div class="mb-5 text-center">
                        <ul class="menu menu-horizontal rounded-box">
                          <li class={isDocumentModelDirty ? '' : 'hidden'}>
                            <button
                              class="tooltip"
                              data-tip="Changes not saved, click to save."
                              on:click={saveDocumentModel}
                            >
                              <span class="badge badge-xs badge-warning"></span>
                            </button>
                          </li>
                          <li>
                            <button class="tooltip" data-tip="Add request" on:click={addRequest}>
                              <span class="icon">
                                <i class="fa fa-plus"></i>
                              </span>
                            </button>
                          </li>
                          <li>
                            <button
                              on:click={editFilename}
                              class="tooltip"
                              data-tip="Edit file name"
                            >
                              <span class="icon">
                                <i class="fa fa-edit"></i>
                              </span>
                            </button>
                          </li>
                          <li>
                            <button
                              class="tooltip"
                              data-tip="Delete this file"
                              on:click={removeFile}
                            >
                              <span class="icon">
                                <i class="fa fa-trash"></i>
                              </span>
                            </button>
                          </li>
                          <li>
                            <button class="tooltip" data-tip="Run all requests in this file">
                              <span class="icon">
                                <i class="fa fa-play"></i>
                              </span>
                            </button>
                          </li>
                        </ul>
                      </div>
                    {/if}
                    <ul class="list bg-base-100 rounded-box shadow-md">
                      {#if activeParsedDocument}
                        {#each activeParsedDocument.blocks as block, idx}
                          <button class="cursor-pointer" data-idx={idx} on:click={onRequestClick}>
                            <li
                              class="list-row {selectedRequest.block === block ? 'bg-primary' : ''}"
                            >
                              <div class="list-col">
                                <span class="icon">
                                  <i class="fa-solid fa-grip-lines"></i>
                                </span>
                              </div>
                              <div class="list-col-grow">
                                {block.requestSeparator.text || `Request ${idx + 1}`}
                              </div>
                            </li>
                          </button>
                        {/each}
                      {/if}
                    </ul>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
    <div class="ui-resizable-handle"></div>
  </div>
  <div class="join-item p-5 flex-1">
    {#if activeParsedDocument && selectedRequest.block}
      <div class="stats shadow">
        <div class="stat relative">
          <div class="stat-figure text-primary">
            <span class="icon">
              <i class="fa fa-file"></i>
            </span>
          </div>
          <div class="stat-title">Current file</div>
          <div class="stat-value text-primary">{selectedFile.name}</div>
          <div class="stat-desc">{selectedFile.filepath}</div>
        </div>

        <div class="stat border-r border-dashed border-r-gray-700">
          <div class="stat-figure text-secondary">
            <span class="icon">
              <i class="fa fa-eye"></i>
            </span>
          </div>
          <div class="stat-title">Current request</div>
          <div class="stat-value text-secondary">{selectedRequest.name}</div>
          <div class="stat-desc">{selectedRequest.name}</div>
        </div>
      </div>
      <div class="stats shadow">
        <div class="stat">
          <div class="stat-figure text-success">
            <span class="icon">
              <i class="fa fa-check"></i>
            </span>
          </div>
          <div class="stat-title">Requests count</div>
          <div class="stat-value text-success">{activeParsedDocument.blocks.length}</div>
          <div class="stat-desc">Total requests in this file</div>
        </div>
        <div class="stat cursor-pointer" on:click={selectEnvironment}>
          <div class="stat-figure text-warning">
            <span class="icon">
              <i class="fa fa-leaf"></i>
            </span>
          </div>
          <div class="stat-title">Environment</div>
          <div class="stat-value text-warning">Staging</div>
          <div class="stat-desc">Your selected environment</div>
        </div>
      </div>
      <div class="join-item text-right">
        <ul class="menu menu-horizontal rounded-box">
          <li>
            <button on:click={editBlockName} class="tooltip" data-tip="Edit request name">
              <span class="icon">
                <i class="fa fa-edit"></i>
              </span>
            </button>
          </li>
          <li>
            <button class="tooltip" data-tip="Delete this request" on:click={removeRequest}>
              <span class="icon">
                <i class="fa fa-trash"></i>
              </span>
            </button>
          </li>
        </ul>
      </div>
      <div class="join w-full">
        <select
          class="join-item select w-fit"
          bind:this={requestMethodSelect}
          on:input={onRequestMethodChange}
        >
          >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="OPTIONS">OPTIONS</option>
          <option value="HEAD">HEAD</option>
          <option value="TRACE">TRACE</option>
          <option value="CONNECT">CONNECT</option>
          <option value="GRAPHQL">GRAPHQL</option>
        </select>
        <input
          bind:this={requestUrlInput}
          on:input={onRequestUrlChange}
          placeholder="https://httpbin.org/get"
          class="join-item input w-full"
          type="url"
          autocomplete="off"
          spellcheck="false"
          on:keydown={onCtrlEnterSendRequest}
        />
        <button class="join-item btn btn-primary" on:click={sendRequest}>
          <span class="icon">
            <i class="fa fa-paper-plane"></i>
          </span>
        </button>
      </div>
      <div role="tablist" class="tabs tabs-lift mb-5 mt-5">
        <button role="tab" class="tab" on:click={changeTab} data-type={VisibleTab.headers}
          >Headers</button
        >
        <button role="tab" class="tab tab-active" on:click={changeTab} data-type={VisibleTab.body}
          >Body</button
        >
        <button role="tab" class="tab" on:click={changeTab} data-type={VisibleTab.scripts}
          >Scripts</button
        >
      </div>

      <!-- tab.headers -->
      <HeaderTabComponent
        {addHeaderDataItem}
        {onHeaderDataChange}
        {removeHeaderDataItem}
        {selectedRequest}
        {visibleTab}
      />

      <!-- tab.body -->
      <BodyTabComponent
        bind:editor
        bind:editorContainer
        bind:graphqlVariablesEditor
        bind:graphqlVariablesEditorContainer
        bind:isEditorSyntaxVisible
        bind:isDocumentModelDirty
        bind:isMultipartFormRequest
        bind:isSimpleFormRequest
        bind:requestBodyTypeSelect
        bind:selectedRequest
        bind:simpleFormRequestVariables
        bind:isEditorVisible
        {onMultipartFormDataChange}
        {addMultipartFormDataItem}
        {removeMultipartFormDataItem}
        {addSimpleFormDataItem}
        {layoutEditors}
        {onRawSyntaxSelectChange}
        {onRequestBodyTypeSelectChange}
        {onSimpleFormDataChange}
        {removeSimpleFormDataItem}
        {sendRequest}
        {visibleTab}
      />

      <!-- tab.scripts -->
      <ScriptsTabComponent {visibleTab} />

      <ResponseEditorComponent
        bind:responseIsVisible
        bind:responseEditorContainer
        bind:responseEditor
        {sendRequest}
      />
    {/if}
  </div>
</div>
