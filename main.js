const MAX_FILES = 20;

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const counter = document.getElementById("counter");
const clearBtn = document.getElementById("clearBtn");
const modal = document.getElementById("modal");
const modalImage = document.getElementById("modalImage");
const modalText = document.getElementById("modalText");
const closeModal = document.getElementById("closeModal");
const modalCopy = document.getElementById("modalCopy");

let total = 0;
let currentModalText = "";

/* BIẾN GLOBAL CHO TESSERACT ĐỂ TỐI ƯU HIỆU SUẤT */
let globalWorker = null;
let currentProgressHandler = null; // Dùng để định tuyến thanh % progress cho đúng thẻ card

updateCounter();

/* ==========================================
   EVENTS (SỰ KIỆN)
========================================== */
fileInput.addEventListener("change", e => { handleFiles([...e.target.files]); });

document.addEventListener("paste", e => {
    const items = [...e.clipboardData.items];
    const images = items.filter(i => i.type.startsWith("image/")).map(i => i.getAsFile());
    if (images.length) handleFiles(images);
});

dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag"); });
dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("drag"); });
dropZone.addEventListener("drop", e => {
    e.preventDefault(); dropZone.classList.remove("drag");
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
    handleFiles(files);
});

clearBtn.addEventListener("click", () => {
    // FIX MEMORY LEAK: Thu hồi toàn bộ ObjectURL của ảnh trước khi xóa thẻ img
    document.querySelectorAll('.preview img').forEach(img => {
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    });
    
    grid.innerHTML = ""; 
    total = 0; 
    updateCounter(); 
    toggleEmpty();
});

closeModal.addEventListener("click", () => { modal.classList.remove("active"); });
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("active"); });

modalCopy.addEventListener("click", () => {
    navigator.clipboard.writeText(currentModalText);
    modalCopy.innerText = "Đã copy";
    setTimeout(() => { modalCopy.innerText = "Copy text"; }, 1500);
});


/* ==========================================
   QUẢN LÝ TESSERACT WORKER (TỐI ƯU HÓA)
========================================== */
async function getWorker() {
    // Chỉ khởi tạo 1 lần duy nhất, dùng chung cho tất cả ảnh
    if (!globalWorker) {
        globalWorker = await Tesseract.createWorker("vie", 1, {
            langPath: "https://tessdata.projectnaptha.com/4.0.0_best",
            logger: m => {
                // Gọi callback động để cập nhật UI cho thẻ card hiện tại
                if (currentProgressHandler) currentProgressHandler(m);
            }
        });

        // TỐI ƯU CẤU HÌNH TESSERACT
        await globalWorker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ!@#$%^&*()_+-=[]{};':\"“”‘’,./<>? \n",
            user_defined_dpi: '300'
        });
    }
    return globalWorker;
}


/* ==========================================
   PREPROCESS IMAGE (TIỀN XỬ LÝ ẢNH)
========================================== */
function preprocessImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(file); // Tạo blob url tạm
        
        img.onload = () => {
            // FIX MEMORY LEAK: Giải phóng bộ nhớ ngay khi load xong vào Image object
            URL.revokeObjectURL(objUrl);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const scale = 2; 
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let data = imgData.data;
            
            const contrast = 45; 
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            for (let i = 0; i < data.length; i += 4) {
                let r = data[i], g = data[i + 1], b = data[i + 2];
                let gray = (r * 0.299 + g * 0.587 + b * 0.114);
                gray = factor * (gray - 128) + 128;
                if(gray > 255) gray = 255;
                if(gray < 0) gray = 0;
                data[i] = data[i+1] = data[i+2] = gray;
            }
            ctx.putImageData(imgData, 0, 0);
            canvas.toBlob(blob => { resolve(blob); }, 'image/png', 1.0);
        };
        img.onerror = reject;
        img.src = objUrl;
    });
}


/* ==========================================
   OCR LOGIC (XỬ LÝ CHÍNH)
========================================== */
async function handleFiles(files){
    const remain = MAX_FILES - total;
    if(remain <= 0){ alert("Đã đạt tối đa 20 ảnh"); return; }
    files = files.slice(0, remain);

    // Chạy tuần tự từng ảnh để tránh nghẽn RAM và cho phép dùng chung 1 Worker
    for(const file of files){
        total++;
        updateCounter(); 
        toggleEmpty();
        
        const src = URL.createObjectURL(file); // Cái này giữ lại cho UI
        const card = createCard(src);
        grid.prepend(card);

        const processedBlob = await preprocessImage(file);
        await processOCR(processedBlob, card, src);
    }
}

function createCard(src){
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
        <div class="preview"><img src="${src}"><div class="badge">Chờ...</div></div>
        <div class="body">
            <div class="text-box">Đang đợi tới lượt xử lý...</div>
            <div class="loading">
                <div class="loading-bar"><div class="loading-progress"></div></div>
                <div class="loading-text">Đang xếp hàng...</div>
            </div>
            <div class="actions">
                <button class="btn copy-btn">Copy text</button>
                <button class="btn open-btn">Xem lớn</button>
            </div>
        </div>
    `;
    return card;
}

async function processOCR(file, card, src){
    const badge = card.querySelector(".badge");
    const textBox = card.querySelector(".text-box");
    const progress = card.querySelector(".loading-progress");
    const loadingText = card.querySelector(".loading-text");
    const copyBtn = card.querySelector(".copy-btn");
    const openBtn = card.querySelector(".open-btn");

    try {
        badge.innerText = "OCR...";
        textBox.textContent = "AI đang quét văn bản...";
        
        // Cập nhật hàm xử lý Progress cho Cụm Card hiện tại
        currentProgressHandler = (m) => {
            // Đảm bảo card vẫn tồn tại (nhỡ người dùng bấm nút Clear giữa chừng)
            if(!document.contains(card)) return;

            if (m.status === "recognizing text") {
                const percent = Math.floor(m.progress * 100);
                progress.style.width = percent + "%";
                badge.innerText = percent + "%";
                loadingText.innerText = "Đang quét... " + percent + "%";
            } else if (m.status.includes("loading") || m.status.includes("initializing")) {
                loadingText.innerText = "Đang tải Core AI (chỉ tốn lần đầu)...";
            }
        };

        // Lấy Worker (Nếu có rồi nó sẽ trả về ngay lập tức, bỏ qua bước khởi tạo)
        const worker = await getWorker();

        // Kiểm tra lại lần nữa lỡ người dùng xóa thẻ trong lúc đợi Worker tải
        if(!document.contains(card)) return;

        // Bắt đầu nhận diện
        loadingText.innerText = "Bắt đầu trích xuất...";
        const result = await worker.recognize(file);
        
        // Reset handler để không bị trùng lặp ở ảnh sau
        currentProgressHandler = null;

        /* SMART FORMAT TỐI ƯU HÓA */
        let raw = result.data.text || "";
        raw = raw.replace(/\r/g,"");
        const lines = raw.split("\n");
        let formatted = [];

        const isSentenceEnd = /[.!?:"”'’\])]\s*$/;

        for(let line of lines){
            line = line.trim();
            if(!line){ formatted.push(""); continue; }

            const matchLetter = line.match(/[a-zA-ZÀ-ỹ]/);
            const firstChar = matchLetter ? matchLetter[0] : line.charAt(0);

            const isLowercase = /^[a-zàáạảãăắằẳẵặâấầẩẫậèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹđ]/.test(firstChar);
            const isUppercase = /^[A-ZÀÁẠẢÃĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊẾỀỂỄỆÌÍỊỈĨÒÓỌỎÕÔỐỒỔỖỘƠỚỜỞỠỢÙÚỤỦŨƯỨỪỬỮỰỲÝỴỶỸĐ]/.test(firstChar);

            let lastValidIndex = formatted.length - 1;
            while (lastValidIndex >= 0 && formatted[lastValidIndex] === "") {
                lastValidIndex--;
            }

            if (lastValidIndex >= 0) {
                const lastValidLine = formatted[lastValidIndex];

                if (isLowercase) {
                    formatted[lastValidIndex] = lastValidLine + " " + line;
                    continue;
                }

                if (isUppercase) {
                    if (!isSentenceEnd.test(lastValidLine)) {
                        formatted[lastValidIndex] = lastValidLine + " " + line;
                        continue;
                    } else {
                        if (formatted[formatted.length - 1] !== "") {
                            formatted.push("");
                        }
                    }
                }
            }
            formatted.push(line);
        }

        let text = formatted.join("\n");
        text = text.replace(/\n{3,}/g,"\n\n");
        text = text.replace(/ll/g, "ll");

        /* HẬU XỬ LÝ (POST-PROCESSING) DẤU NGOẶC KÉP */
        text = text.replace(/\?\?\s*\*\*\*\s*\d*\s*[a-zA-Z*]+/gi, '”'); 
        text = text.replace(/([.!?])\s*\?\?+$/gm, '$1”'); 
        text = text.replace(/(^|\s)"/g, '$1“');
        text = text.replace(/"(\s|$|[.,!?])/g, '”$1');

        let paragraphs = text.split('\n\n');
        for(let i=0; i<paragraphs.length; i++) {
            let p = paragraphs[i].trim();
            if(!p) continue;

            let openQuotes = (p.match(/“/g) || []).length;
            let closeQuotes = (p.match(/”/g) || []).length;

            if(openQuotes > closeQuotes) {
                if(/[.!?]$/.test(p)) paragraphs[i] = p + '”';
                else paragraphs[i] = p + '”';
            }
        }
        text = paragraphs.join('\n\n').trim();
        /* ======================================= */

        if(!text) text = "Không tìm thấy văn bản nào.";

        textBox.textContent = text;
        badge.innerText = "Hoàn tất";
        loadingText.innerText = "Đã trích xuất xong";
        progress.style.width = "100%";

        copyBtn.addEventListener("click", e => {
            e.stopPropagation();
            navigator.clipboard.writeText(text);
            copyBtn.innerText = "Đã copy";
            setTimeout(()=>{ copyBtn.innerText = "Copy text"; }, 1500);
        });

        const openModal = () => {
            modalImage.src = src; 
            modalText.textContent = text;
            currentModalText = text;
            modal.classList.add("active");
        };

        openBtn.addEventListener("click", e => { e.stopPropagation(); openModal(); });
        card.addEventListener("click", openModal);

    } catch(err) {
        console.error(err);
        if(!document.contains(card)) return; // Tránh báo lỗi nếu thẻ đã bị xóa
        badge.innerText = "Lỗi";
        textBox.textContent = "Không thể đọc văn bản từ ảnh này.";
        loadingText.innerText = "OCR thất bại";
    }
}

/* UI */
function updateCounter(){ counter.innerText = `${total} / ${MAX_FILES} ảnh`; }
function toggleEmpty(){ empty.style.display = total ? "none" : "flex"; }