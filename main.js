// 1. Instâncias Globais
const cpu = new MIC1Hardware(); 
const assembler = new MIC1Assembler(); 

// Variáveis de Estado
let isRunning = false;
let simulationTimer = null;
let currentCacheView = 'data';

// Cache visual para performance (Evita atualizar o DOM sem necessidade). Armazena o último valor mostrado na tela para cada endereço
const displayMemoryCache = new Array(4096).fill(-1); 
let lastPCHighlight = -1; // Última linha destacada

const registersList = ['PC', 'AC', 'SP', 'IR', 'MAR', 'MBR', 'TIR', 'A', 'B', 'C'];

// 2. Inicialização
document.addEventListener("DOMContentLoaded", () => {
    
    // Inicialização da Interface
    initRegistersUI();
    initMemoryTable(); // Cria as 4096 linhas vazias UMA VEZ
    updateInterface(); // Preenche os valores iniciais


    // Compilar
    document.getElementById('btn-compile').addEventListener('click', () => {
        if(isRunning) stopSimulation();
        
        const sourceCode = document.getElementById('editor').value;
        const result = assembler.compile(sourceCode);

        if (result.errors.length > 0) {
            alert("Erros de Compilação:\n" + result.errors.join("\n"));
        } else {
            cpu.loadProgram(result.binary);
            
            // Força atualização visual completa ao carregar novo programa
            // Resetamos o cache visual para garantir que tudo seja redesenhado
            displayMemoryCache.fill(-1); 
            
            updateInterface();
            logMicro(`Programa carregado. (${result.binary.length} instruções)`);
        }
    });
    
    // Reset button
    document.getElementById('btn-reset').addEventListener('click', () => {
        stopSimulation();
        cpu.reset();
        displayMemoryCache.fill(-1); // Força redesenho
        logMicro("--- Sistema Reiniciado ---");
        updateInterface();
    });

    // step by step button
    document.getElementById('btn-step').addEventListener('click', () => {
        if(isRunning) stopSimulation();
        if(cpu.halted) {
            logMicro("CPU parada (HALT). Reinicie para continuar.");
            return;
        }
        cpu.step(); 
        updateInterface(); 
    });

    // Run
    document.getElementById('btn-run').addEventListener('click', () => {
        if (!isRunning) startSimulation();
    });

    // Pause
    document.getElementById('btn-pause').addEventListener('click', () => {
        if (isRunning) stopSimulation();
    });

    // Slider
    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    speedSlider.addEventListener('input', (e) => {
        speedVal.textContent = e.target.value;
    });
});

function startSimulation() {
    if (cpu.halted) {
        logMicro("A CPU está em HALT. Resete para rodar novamente.");
        return;
    }

    isRunning = true;
    document.getElementById('btn-run').classList.add('active-state');
    
    const runStep = () => {
        if (!isRunning) return;

        cpu.step();
        updateInterface();

        if (cpu.halted) {
            stopSimulation();
            logMicro("=== FIM DA EXECUÇÃO (HALT) ===");
            return;
        }

        const currentSpeedHz = parseInt(document.getElementById('speed-slider').value);
        const delayMs = Math.max(1000 / currentSpeedHz, 10); 

        simulationTimer = setTimeout(runStep, delayMs);
    };

    runStep();
}

function stopSimulation() {
    isRunning = false;
    if (simulationTimer) {
        clearTimeout(simulationTimer);
        simulationTimer = null;
    }
    document.getElementById('btn-run').classList.remove('active-state');
    logMicro("Execução Pausada.");
}

// --- FUNÇÕES DE INTERFACE ---

function initRegistersUI() {
    const container = document.getElementById('registers-container');
    container.innerHTML = ''; 
    registersList.forEach(reg => {
        const card = document.createElement('div');
        card.className = 'reg-card';
        card.innerHTML = `
            <div class="reg-name">${reg}</div>
            <div class="reg-hex" id="reg-${reg}-hex">0000</div>
            <div class="reg-dec" id="reg-${reg}-dec">0</div>
        `;
        container.appendChild(card);
    });
}

// Cria a estrutura estática da tabela
function initMemoryTable() {
    const tbody = document.getElementById('memory-body');
    tbody.innerHTML = '';
    
    // Fragmento para inserir tudo de uma vez
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < cpu.MEMORY_SIZE; i++) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${i}</td>
            <td class="mem-bin">0000000000000000</td>
            <td class="mem-dec">0</td>
            <td class="mem-hex">0x0000</td>
        `;
        fragment.appendChild(row);
    }
    tbody.appendChild(fragment);
}

function updateInterface() {
    updateRegistersValues();
    updateMemoryView();
    updateCacheView();
    updateLogs();
}

function updateRegistersValues() {
    registersList.forEach(reg => {
        const val = cpu.registers[reg];
        const elHex = document.getElementById(`reg-${reg}-hex`);
        const elDec = document.getElementById(`reg-${reg}-dec`);
        if(elHex && elDec) {
            elHex.textContent = "0x" + val.toString(16).toUpperCase().padStart(4, '0');
            let signedVal = val;
            if (signedVal > 32767) signedVal -= 65536;
            elDec.textContent = signedVal.toString(10);
        }
    });
}

function updateMemoryView() {
    const tbody = document.getElementById('memory-body');
    const rows = tbody.rows; // Coleção direta das linhas (rápido)
    const pc = cpu.registers['PC'];

    // 1. Atualizar Destaque do PC (Linha azul)
    if (lastPCHighlight !== -1 && rows[lastPCHighlight]) {
        rows[lastPCHighlight].style.backgroundColor = ""; 
    }
    if (rows[pc]) {
        rows[pc].style.backgroundColor = "#2d4a57";
        
    }
    lastPCHighlight = pc;

    // 2. Atualizar Valores (Smart Update)
    for (let i = 0; i < cpu.MEMORY_SIZE; i++) {
        const val = cpu.memory[i];
        
        // Se o valor na memória for diferente do que mostramos por último...
        if (val !== displayMemoryCache[i]) {
            const row = rows[i];
            
            // Recalcula formatações
            let signedVal = val;
            if (signedVal > 32767) signedVal -= 65536;
            
            // Atualiza células (índices: 0=Addr, 1=Bin, 2=Dec, 3=Hex)
            row.cells[1].textContent = val.toString(2).padStart(16, '0');
            row.cells[2].textContent = signedVal;
            row.cells[3].textContent = "0x" + val.toString(16).toUpperCase().padStart(4, '0');

            // Atualiza cache visual
            displayMemoryCache[i] = val;
        }
    }
}

function updateCacheView() {
    const tbody = document.getElementById('cache-body');
    if(!tbody) return;
    tbody.innerHTML = '';

    let activeCache;
    if (currentCacheView === 'inst') activeCache = cpu.instCache;
    else activeCache = cpu.dataCache;

    activeCache.lines.forEach((line, idx) => {
        const row = document.createElement('tr');
        const dataHex = line.data.map(d => "0x" + d.toString(16).toUpperCase().padStart(4,'0')).join(' ');
        
        if (line.valid) row.style.color = "#4ec9b0"; 
        
        if (line.dirty) row.style.color = "#ff8c00"; 

        row.innerHTML = `
            <td>${idx}</td>
            <td>${line.valid ? '1' : '0'}</td>
            <td>${line.tag}</td>
            <td>${line.dirty ? '1' : '0'}</td> <td style="font-family: monospace; font-size: 11px;">[ ${dataHex} ]</td>
        `;
        tbody.appendChild(row);
    });
}

function updateLogs() {
    if (cpu.microLog.length > 0) {
        cpu.microLog.forEach(msg => logMicro(msg));
        cpu.microLog = []; 
    }
}

function logMicro(msg) {
    const logContainer = document.getElementById('micro-log');
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerText = msg;
    logContainer.appendChild(line);
    logContainer.scrollTop = logContainer.scrollHeight;
}

window.switchTab = function(tabType) {
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (tabType === 'data') btns[0].classList.add('active');
    else btns[1].classList.add('active');
    
    currentCacheView = tabType;
    updateCacheView(); 
};