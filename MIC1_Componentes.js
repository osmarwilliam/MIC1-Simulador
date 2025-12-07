class MIC1Hardware {
    constructor() {
        this.MEMORY_SIZE = 4096;
        // Memória Principal (RAM) inicializada com 0
        this.memory = new Array(this.MEMORY_SIZE).fill(0);

        // A classe Cache deve estar carregada globalmente via cache.js
        this.instCache = new Cache(this.memory, 8, 4);
        this.dataCache = new Cache(this.memory, 8, 4);

        // Registradores
        this.registers = {
            'PC': 0, 
            'AC': 0, 
            'SP': 4095,
            'IR': 0, 
            'TIR': 0, 
            'MAR': 0, 
            'MBR': 0,
            'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0
        };

        this.halted = false;
        this.microLog = []; // Log do ciclo atual
    }

    reset() {
        this.memory.fill(0);
        // Recria as caches zeradas
        this.instCache = new Cache(this.memory, 8, 4);
        this.dataCache = new Cache(this.memory, 8, 4);

        // Zera registradores
        for (let key in this.registers) {
            this.registers[key] = 0;
        }
        this.registers['SP'] = 4095;
        this.halted = false;
        this.microLog = [];
    }

    loadProgram(programData) {
        this.reset();
        for (let i = 0; i < programData.length; i++) {
            if (i < this.MEMORY_SIZE) {
                this.memory[i] = programData[i];
            }
        }
    }

    //Tratar overflow de 16 bits (0-65535)
    _mask16(val) {
        return val & 0xFFFF;
    }

    //Converter unsigned 16-bit para signed JS (para comparações < 0)
    _toSigned(val) {
        val = val & 0xFFFF;
        if (val > 32767) return val - 65536;
        return val;
    }

    //Busca de Instrução 
    _fetchInstruction(addr) {
        if (addr >= 0 && addr < this.MEMORY_SIZE) {
            this.registers['MAR'] = addr;
            const val = this.instCache.read(addr);
            this.registers['MBR'] = val;
            return val;
        }
        return 0;
    }

    //Leitura de Dados
    _readData(addr) {
        if (addr >= 0 && addr < this.MEMORY_SIZE) {
            this.registers['MAR'] = addr;
            const val = this.dataCache.read(addr);
            this.registers['MBR'] = val;
            return val;
        }
        return 0;
    }

    //Escrita de Dados
    _writeData(addr, val) {
        if (addr >= 0 && addr < this.MEMORY_SIZE) {
            this.registers['MAR'] = addr;
            this.registers['MBR'] = val;
            this.dataCache.write(addr, val);
        }
    }

    // Executa um ciclo de máquina
    step() {
        if (this.halted) return;

        let pc = this.registers['PC'];
        if (pc >= this.MEMORY_SIZE) {
            this.halted = true;
            return;
        }

        this.microLog = []; // Limpa log do passo anterior

        // 1. FETCH
        this.microLog.push(`[FETCH] MAR <- PC (${pc}); RD (I-Cache);`);
        const instruction = this._fetchInstruction(pc);
        this.microLog.push(`[FETCH] PC <- PC + 1; IR <- MBR (${this._toHex(instruction)});`);
        
        this.registers['IR'] = instruction;
        this.registers['PC'] = this._mask16(pc + 1);

        // 2. DECODE
        const opcode4 = (instruction >> 12) & 0xF;
        const operand12 = instruction & 0xFFF;

        // 3. EXECUTE 
        
        switch (opcode4) {
            case 0b0000: // LODD
                this.microLog.push(`[LODD] MAR <- ${operand12}; RD (D-Cache);`);
                var val = this._readData(operand12);
                this.registers['AC'] = val;
                this.microLog.push(`[LODD] AC <- MBR (${val});`);
                break;

            case 0b0001: // STOD
                var ac = this.registers['AC'];
                this._writeData(operand12, ac);
                this.microLog.push(`[STOD] MAR <- ${operand12}; MBR <- AC (${ac}); WR (D-Cache);`);
                break;

            case 0b0010: // ADDD
                var val = this._readData(operand12);
                var res = this._mask16(this.registers['AC'] + val);
                this.registers['AC'] = res;
                this.microLog.push(`[ADDD] AC <- AC + MBR (${res});`);
                break;

            case 0b0011: // SUBD
                var val = this._readData(operand12);
                var res = this._mask16(this.registers['AC'] - val);
                this.registers['AC'] = res;
                this.microLog.push(`[SUBD] AC <- AC - MBR (${res});`);
                break;

            case 0b0100: // JPOS
                var acSigned = this._toSigned(this.registers['AC']);
                if (acSigned >= 0) {
                    this.registers['PC'] = operand12;
                    this.microLog.push(`[JPOS] AC >= 0. PC <- ${operand12}`);
                } else {
                    this.microLog.push(`[JPOS] AC < 0. Salto ignorado.`);
                }
                break;

            case 0b0101: // JZER
                if (this.registers['AC'] === 0) {
                    this.registers['PC'] = operand12;
                    this.microLog.push(`[JZER] AC == 0. PC <- ${operand12}`);
                } else {
                    this.microLog.push(`[JZER] AC != 0. Salto ignorado.`);
                }
                break;

            case 0b0110: // JUMP
                this.registers['PC'] = operand12;
                this.microLog.push(`[JUMP] PC <- ${operand12}`);
                break;

            case 0b0111: // LOCO
                this.registers['AC'] = operand12;
                this.microLog.push(`[LOCO] AC <- ${operand12}`);
                break;

            case 0b1000: // LODL (Local Load: SP + offset)
                var addr = this._mask16(this.registers['SP'] + operand12);
                var val = this._readData(addr);
                this.registers['AC'] = val;
                this.microLog.push(`[LODL] MAR <- SP + ${operand12}; RD; AC <- MBR`);
                break;

            case 0b1001: // STOL (Local Store: SP + offset)
                var addr = this._mask16(this.registers['SP'] + operand12);
                var val = this.registers['AC'];
                this._writeData(addr, val);
                this.microLog.push(`[STOL] MAR <- SP + ${operand12}; MBR <- AC; WR`);
                break;

            case 0b1010: // ADDL
                var addr = this._mask16(this.registers['SP'] + operand12);
                var val = this._readData(addr);
                this.registers['AC'] = this._mask16(this.registers['AC'] + val);
                this.microLog.push(`[ADDL] AC <- AC + Mem[SP+${operand12}]`);
                break;

            case 0b1011: // SUBL
                var addr = this._mask16(this.registers['SP'] + operand12);
                var val = this._readData(addr);
                this.registers['AC'] = this._mask16(this.registers['AC'] - val);
                this.microLog.push(`[SUBL] AC <- AC - Mem[SP+${operand12}]`);
                break;

            case 0b1100: // JNEG
                var acSigned = this._toSigned(this.registers['AC']);
                if (acSigned < 0) {
                    this.registers['PC'] = operand12;
                    this.microLog.push(`[JNEG] AC < 0. PC <- ${operand12}`);
                } else {
                    this.microLog.push(`[JNEG] Salto ignorado.`);
                }
                break;

            case 0b1101: // JNZE
                if (this.registers['AC'] !== 0) {
                    this.registers['PC'] = operand12;
                    this.microLog.push(`[JNZE] AC != 0. PC <- ${operand12}`);
                } else {
                    this.microLog.push(`[JNZE] Salto ignorado.`);
                }
                break;

            case 0b1110: // CALL
                var sp = this._mask16(this.registers['SP'] - 1);
                this.registers['SP'] = sp;
                this._writeData(sp, this.registers['PC']); // Salva endereço de retorno
                this.registers['PC'] = operand12;
                this.microLog.push(`[CALL] SP<-SP-1; Mem[SP]<-PC; PC<-${operand12}`);
                break;

            case 0b1111: // Instruções Estendidas (Sub-opcodes)
                const highByte = (instruction >> 8) & 0xFF;
                const lowByte = instruction & 0xFF;

                if (highByte === 0b11111100) { // INSP
                    this.registers['SP'] = this._mask16(this.registers['SP'] + lowByte);
                    this.microLog.push(`[INSP] SP <- SP + ${lowByte}`);
                }
                else if (highByte === 0b11111110) { // DESP
                    this.registers['SP'] = this._mask16(this.registers['SP'] - lowByte);
                    this.microLog.push(`[DESP] SP <- SP - ${lowByte}`);
                }
                else if (instruction === 0xF000) { // PSHI (Push Indirect)
                    var addr = this.registers['AC'];
                    var val = this._readData(addr);
                    var sp = this._mask16(this.registers['SP'] - 1);
                    this.registers['SP'] = sp;
                    this._writeData(sp, val);
                    this.microLog.push(`[PSHI] Push Indirect: Stack <- Mem[AC:${addr}] (${val})`);
                }
                else if (instruction === 0xF200) { // POPI (Pop Indirect)
                    var sp = this.registers['SP'];
                    var val = this._readData(sp);
                    var addr = this.registers['AC'];
                    this._writeData(addr, val);
                    this.registers['SP'] = this._mask16(sp + 1);
                    this.microLog.push(`[POPI] Pop Indirect: Mem[AC:${addr}] <- Stack (${val})`);
                }
                else if (instruction === 0xF400) { // PUSH
                    var sp = this._mask16(this.registers['SP'] - 1);
                    this.registers['SP'] = sp;
                    this._writeData(sp, this.registers['AC']);
                    this.microLog.push(`[PUSH] SP<-SP-1; Mem[SP] <- AC`);
                }
                else if (instruction === 0xF600) { // POP
                    var sp = this.registers['SP'];
                    var val = this._readData(sp);
                    this.registers['AC'] = val;
                    this.registers['SP'] = this._mask16(sp + 1);
                    this.microLog.push(`[POP] AC <- Mem[SP]; SP<-SP+1`);
                }
                else if (instruction === 0xF800) { // RETN
                    var sp = this.registers['SP'];
                    var retAddr = this._readData(sp);
                    this.registers['PC'] = retAddr;
                    this.registers['SP'] = this._mask16(sp + 1);
                    this.microLog.push(`[RETN] PC <- Mem[SP]; SP <- SP + 1`);
                }
                else if (instruction === 0xFA00) { // SWAP
                    var temp = this.registers['AC'];
                    this.registers['AC'] = this.registers['SP'];
                    this.registers['SP'] = temp;
                    this.microLog.push(`[SWAP] AC <-> SP`);
                }
                else if (instruction === 0xFFFF) { // HALT
                    this.halted = true;
                    this.dataCache.flushAll();
                    this.instCache.flushAll();
                    this.microLog.push(`[HALT] Execução finalizada. Caches FLUSHED.`);
                }
                else {
                    this.microLog.push(`Instrução Desconhecida: ${this._toHex(instruction)}`);
                }
                break;

            default:
                this.microLog.push(`Opcode Inválido: ${opcode4}`);
        }
    }

    _toHex(val) {
        return "0x" + val.toString(16).toUpperCase().padStart(4, '0');
    }
}