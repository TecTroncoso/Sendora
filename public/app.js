document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        targets: [],
        files: []
    };

    // Elements
    const elements = {
        statusBadge: document.getElementById('conn-status'),
        statusText: document.querySelector('.status-text'),
        navBtns: document.querySelectorAll('.nav-btn'),
        tabPanes: document.querySelectorAll('.tab-pane'),
        targetSelect: document.getElementById('target-select'),
        contactsTbody: document.getElementById('contacts-tbody'),
        sendForm: document.getElementById('send-form'),
        btnSend: document.getElementById('btn-send'),
        fileInput: document.getElementById('new-file-path'),
        btnAddFile: document.getElementById('btn-add-file'),
        fileList: document.getElementById('file-list'),
        toast: document.getElementById('toast'),
        messageText: document.getElementById('message-text')
    };

    // Auth Elements
    const authElements = {
        overlay: document.getElementById('auth-overlay'),
        btnQr: document.getElementById('btn-auth-qr'),
        btnPairing: document.getElementById('btn-auth-pairing'),
        qrContainer: document.getElementById('auth-qr-container'),
        pairingContainer: document.getElementById('auth-pairing-container'),
        qrBox: document.getElementById('qrcode-box'),
        phoneInput: document.getElementById('phone-number'),
        btnRequestPairing: document.getElementById('btn-request-pairing'),
        pairingCodeDisplay: document.getElementById('pairing-code-display'),
        status: document.getElementById('auth-status')
    };

    // Navigation
    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.navBtns.forEach(b => b.classList.remove('active'));
            elements.tabPanes.forEach(t => t.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // File Management
    elements.btnAddFile.addEventListener('click', () => {
        const path = elements.fileInput.value.trim();
        if (path) {
            state.files.push(path);
            renderFiles();
            elements.fileInput.value = '';
        }
    });

    window.removeFile = (index) => {
        state.files.splice(index, 1);
        renderFiles();
    };

    function renderFiles() {
        elements.fileList.innerHTML = state.files.map((file, index) => `
            <div class="file-item">
                <span title="${file}">${file.length > 50 ? '...' + file.slice(-47) : file}</span>
                <button type="button" class="remove-file" onclick="removeFile(${index})">&times;</button>
            </div>
        `).join('');
    }

    // Toast
    function showToast(message, type = 'success') {
        elements.toast.textContent = message;
        elements.toast.className = `toast show ${type}`;
        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    }

    // Auth & SSE Flow
    let sseSource = null;

    function startSSE() {
        if (sseSource) return; // Already listening
        sseSource = new EventSource('/api/auth/events');
        
        sseSource.addEventListener('connected', () => {
            authElements.overlay.classList.add('hidden');
            if (sseSource) {
                sseSource.close();
                sseSource = null;
            }
            checkStatus();
        });

        sseSource.addEventListener('qr', (e) => {
            const data = JSON.parse(e.data);
            authElements.qrBox.innerHTML = ''; // Limpiar código anterior si existe
            new QRCode(authElements.qrBox, {
                text: data.qr,
                width: 250,
                height: 250,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L
            });
            authElements.status.textContent = 'Esperando escaneo...';
        });

        sseSource.addEventListener('pairing_code', (e) => {
            const data = JSON.parse(e.data);
            authElements.pairingCodeDisplay.textContent = data.code;
            authElements.pairingCodeDisplay.classList.remove('hidden');
            authElements.status.textContent = 'Ingresá este código en tu WhatsApp.';
        });

        sseSource.addEventListener('error', (e) => {
            const data = e.data ? JSON.parse(e.data) : { message: 'Error de conexión' };
            authElements.status.textContent = 'Error: ' + data.message;
        });
    }

    async function requestAuth(mode, phone = '') {
        authElements.status.textContent = 'Iniciando conexión...';
        try {
            const res = await fetch('/api/auth/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authMode: mode, phoneNumber: phone })
            });
            const data = await res.json();
            if (data.success) {
                authElements.status.textContent = mode === 'qr' ? 'Generando código QR...' : 'Solicitando código de emparejamiento...';
                startSSE();
            } else {
                authElements.status.textContent = 'Error: ' + data.error;
            }
        } catch (err) {
            authElements.status.textContent = 'Error de red.';
        }
    }

    authElements.btnQr.addEventListener('click', () => {
        authElements.qrContainer.classList.remove('hidden');
        authElements.pairingContainer.classList.add('hidden');
        requestAuth('qr');
    });

    authElements.btnPairing.addEventListener('click', () => {
        authElements.pairingContainer.classList.remove('hidden');
        authElements.qrContainer.classList.add('hidden');
    });

    authElements.btnRequestPairing.addEventListener('click', () => {
        const phone = authElements.phoneInput.value.trim();
        if (/^\d{10,15}$/.test(phone)) {
            requestAuth('pairing', phone);
        } else {
            authElements.status.textContent = 'Ingresá un número válido (ej: 5491122334455)';
        }
    });

    // Fetch Status
    async function checkStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.connected) {
                authElements.overlay.classList.add('hidden');
                elements.statusBadge.classList.add('connected');
                elements.statusText.textContent = `Conectado: ${data.user?.name || 'WhatsApp'}`;
            } else {
                authElements.overlay.classList.remove('hidden');
                elements.statusBadge.classList.remove('connected');
                elements.statusText.textContent = 'Desconectado';
                startSSE(); // Conectar SSE para esperar eventos si ya se inició la conexión desde otro lado
            }
        } catch (error) {
            authElements.overlay.classList.remove('hidden');
            elements.statusBadge.classList.remove('connected');
            elements.statusText.textContent = 'Error de conexión';
        }
    }

    // Fetch Targets
    async function loadTargets() {
        try {
            const res = await fetch('/api/targets');
            state.targets = await res.json();
            
            // Populate Select
            elements.targetSelect.innerHTML = '<option value="" disabled selected>Seleccioná un destino...</option>' + 
                state.targets.map(t => `<option value="${t.id}">${t.name} [${t.type}]</option>`).join('');
            
            // Populate Table
            elements.contactsTbody.innerHTML = state.targets.length === 0 ? 
                '<tr><td colspan="3" class="text-center">No hay contactos guardados</td></tr>' :
                state.targets.map(t => `
                    <tr>
                        <td>${t.name}</td>
                        <td><span class="badge">${t.type}</span></td>
                        <td style="color: var(--text-secondary); font-family: monospace;">${t.jid}</td>
                    </tr>
                `).join('');
        } catch (error) {
            showToast('Error cargando contactos', 'error');
        }
    }

    // Send Message
    elements.sendForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const targetId = parseInt(elements.targetSelect.value);
        const target = state.targets.find(t => t.id === targetId);
        const text = elements.messageText.value;

        if (!target) return;
        if (!text.trim() && state.files.length === 0) {
            showToast('Escribí un mensaje o agregá un archivo', 'error');
            return;
        }

        elements.btnSend.disabled = true;
        elements.btnSend.innerHTML = 'Enviando...';

        try {
            const res = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetId: target.id,
                    targetJid: target.jid,
                    text: text.trim() || undefined,
                    filePaths: state.files
                })
            });

            const data = await res.json();
            
            if (res.ok) {
                showToast('Mensaje enviado exitosamente');
                elements.messageText.value = '';
                state.files = [];
                renderFiles();
            } else {
                showToast(data.error || 'Error al enviar mensaje', 'error');
            }
        } catch (error) {
            showToast('Error de conexión con el servidor', 'error');
        } finally {
            elements.btnSend.disabled = false;
            elements.btnSend.innerHTML = `Enviar Mensaje <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
        }
    });

    // Init
    checkStatus();
    loadTargets();
    setInterval(checkStatus, 10000); // Check status every 10s
});
