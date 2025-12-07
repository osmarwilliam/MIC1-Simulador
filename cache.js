class CacheLine {
    constructor(blockSize) {
        this.valid = false;
        this.tag = 0;
        this.dirty = false;
        // Inicializa array de dados com zeros
        this.data = new Array(blockSize).fill(0);
    }
}


class Cache {
    constructor(memoryRef, numLines = 8, blockSize = 4) {
        this.memoryRef = memoryRef; // Referência direta à RAM
        this.numLines = numLines;
        this.blockSize = blockSize;
        
        this.lines = [];
        for (let i = 0; i < numLines; i++) {
            this.lines.push(new CacheLine(blockSize));
        }

        this.hits = 0;
        this.misses = 0;
        this.log = [];
    }

    _getLineIndex(address) {
        return Math.floor(address / this.blockSize) % this.numLines;
    }

    _getTag(address) {
        return Math.floor(address / (this.blockSize * this.numLines));
    }

    _getBlockStartAddress(address) {
        return Math.floor(address / this.blockSize) * this.blockSize;
    }

    // Leitura, Simplificada: Sem verificação de Dirty Bit
    read(address) {
        const lineIdx = this._getLineIndex(address);
        const tag = this._getTag(address);
        const offset = address % this.blockSize;
        const line = this.lines[lineIdx];

        if (line.valid && line.tag === tag) {
            this.hits++;
            this.log.push(`Cache HIT em ${address} (L${lineIdx})`);
            return line.data[offset];
        } else {
            this.misses++;
            this.log.push(`Cache MISS em ${address}. Buscando RAM...`);

            // Traz bloco novo da RAM
            const blockStart = this._getBlockStartAddress(address);
            for (let i = 0; i < this.blockSize; i++) {
                if (blockStart + i < this.memoryRef.length) {
                    line.data[i] = this.memoryRef[blockStart + i];
                }
            }

            line.valid = true;
            line.tag = tag;
            // line.dirty = false; // Não usamos mais Dirty bit

            return line.data[offset];
        }
    }

    // Escrita (Write-Through: Atualiza Cache E RAM)
    write(address, value) {
        const lineIdx = this._getLineIndex(address);
        const tag = this._getTag(address);
        const offset = address % this.blockSize;
        const line = this.lines[lineIdx];

        // 1. Política de Alocação (Write-Allocate):
        if (!(line.valid && line.tag === tag)) {
            this.misses++;
            this.log.push(`Cache WRITE MISS em ${address}. Alocando...`);
            
            const blockStart = this._getBlockStartAddress(address);
            for (let i = 0; i < this.blockSize; i++) {
                if (blockStart + i < this.memoryRef.length) {
                    line.data[i] = this.memoryRef[blockStart + i];
                }
            }
            line.valid = true;
            line.tag = tag;
        } else {
            this.hits++;
            this.log.push(`Cache WRITE HIT em ${address}`);
        }

        // 2. Atualiza a Cache
        line.data[offset] = value;
        
        // 3. atualiza a RAM imediatamente (Write-Through)
        this.memoryRef[address] = value;
        this.log.push(`Write-Through: RAM atualizada imediatamente em ${address}`);
    }

    flushAll() {
        this.log.push("FLUSH: Cache já sincronizada (Write-Through).");
    }
}