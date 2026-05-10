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

updateCounter();

/* EVENTS */
fileInput.addEventListener("change", e=>{ handleFiles([...e.target.files]); });

document.addEventListener("paste", e=>{
    const items = [...e.clipboardData.items];
    const images = items.filter(i => i.type.startsWith("image/")).map(i => i.getAsFile());
    if(images.length) handleFiles(images);
});

dropZone.addEventListener("dragover", e=>{ e.preventDefault(); dropZone.classList.add("drag"); });
dropZone.addEventListener("dragleave", ()=>{ dropZone.classList.remove("drag"); });
dropZone.addEventListener("drop", e=>{
    e.preventDefault(); dropZone.classList.remove("drag");
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
    handleFiles(files);
});

clearBtn.addEventListener("click", ()=>{
    grid.innerHTML = ""; total = 0; updateCounter(); toggleEmpty();
});

closeModal.addEventListener("click", ()=>{ modal.classList.remove("active"); });
modal.addEventListener("click", e=>{ if(e.target === modal) modal.classList.remove("active"); });

modalCopy.addEventListener("click", ()=>{
    navigator.clipboard.writeText(currentModalText);
    modalCopy.innerText = "Đã copy";
    setTimeout(()=>{ modalCopy.innerText = "Copy text"; },1500);
});

/* PREPROCESS IMAGE */
function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
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
            
            // Giảm contrast xuống 45 (cũ là 60) để tránh làm đứt/mờ nét mỏng của dấu ngoặc kép (" ")
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
    });
}

/* OCR */
async function handleFiles(files){
    const remain = MAX_FILES - total;
    if(remain <= 0){ alert("Đã đạt tối đa 20 ảnh"); return; }
    files = files.slice(0,remain);

    for(const file of files){
        total++;
        updateCounter(); toggleEmpty();
        const src = URL.createObjectURL(file);
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
        <div class="preview"><img src="${src}"><div class="badge">OCR...</div></div>
        <div class="body">
            <div class="text-box">Đang xử lý văn bản AI...</div>
            <div class="loading">
                <div class="loading-bar"><div class="loading-progress"></div></div>
                <div class="loading-text">Đang khởi tạo OCR...</div>
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

    try{
        const worker = await Tesseract.createWorker("vie", 1, {
            langPath: "https://tessdata.projectnaptha.com/4.0.0_best",
            logger: m => {
                if(m.status === "recognizing text"){
                    const percent = Math.floor(m.progress * 100);
                    progress.style.width = percent + "%";
                    badge.innerText = percent + "%";
                    loadingText.innerText = "Đang quét văn bản... " + percent + "%";
                }
            }
        });

        // TỐI ƯU CẤU HÌNH TESSERACT (Đã thêm ký tự ngoặc kép vào whitelist)
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            // ĐÃ BỔ SUNG: “”‘’ vào danh sách whitelist để AI không bị cấm nhận diện ngoặc kép
            tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ!@#$%^&*()_+-=[]{};':\"“”‘’,./<>? \n",
            user_defined_dpi: '300'
        });

        const result = await worker.recognize(file);
        await worker.terminate();

        /* SMART FORMAT TỐI ƯU HÓA */
        let raw = result.data.text || "";
        raw = raw.replace(/\r/g,"");
        const lines = raw.split("\n");
        let formatted = [];

        for(let line of lines){
            line = line.trim();
            if(!line){ formatted.push(""); continue; }

            const matchLetter = line.match(/[a-zA-ZÀ-ỹ]/);
            const firstChar = matchLetter ? matchLetter[0] : line.charAt(0);

            const isLowercase = /^[a-zàáạảãăắằẳẵặâấầẩẫậèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹđ]/.test(firstChar);
            const isUppercase = /^[A-ZÀÁẠẢÃĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊẾỀỂỄỆÌÍỊỈĨÒÓỌỎÕÔỐỒỔỖỘƠỚỜỞỠỢÙÚỤỦŨƯỨỪỬỮỰỲÝỴỶỸĐ]/.test(firstChar);

            if(isLowercase && formatted.length){
                let lastIndex = formatted.length - 1;
                while (lastIndex >= 0 && formatted[lastIndex] === "") lastIndex--; 
                if (lastIndex >= 0) {
                    formatted[lastIndex] = formatted[lastIndex] + " " + line;
                    continue;
                }
            }

            if(isUppercase && formatted.length){
                const last = formatted[formatted.length - 1];
                if(last !== "") formatted.push("");
            }
            formatted.push(line);
        }

        let text = formatted.join("\n");
        text = text.replace(/\n{3,}/g,"\n\n");
        text = text.replace(/ll/g, "ll");

        /* ========================================================= */
        /* THUẬT TOÁN HẬU XỬ LÝ (POST-PROCESSING) CHUYÊN TRỊ DẤU NGOẶC */
        /* ========================================================= */
        
        // 1. Dọn dẹp rác AI tự sinh ra do lỗi đọc ngoặc kép (như ?? *** 1 x***)
        text = text.replace(/\?\?\s*\*\*\*\s*\d*\s*[a-zA-Z*]+/gi, '”'); 
        text = text.replace(/([.!?])\s*\?\?+$/gm, '$1”'); 

        // 2. Chuyển đổi toàn bộ ngoặc kép "" thường thành ngoặc kép thông minh “ ” cho đẹp
        text = text.replace(/(^|\s)"/g, '$1“');
        text = text.replace(/"(\s|$|[.,!?])/g, '”$1');

        // 3. Quét thông minh: Tự động đóng ngoặc kép nếu phát hiện đầu câu mở ngoặc nhưng cuối câu quên đóng
        let paragraphs = text.split('\n\n');
        for(let i=0; i<paragraphs.length; i++) {
            let p = paragraphs[i].trim();
            if(!p) continue;

            // Đếm số lượng ngoặc mở và đóng trong đoạn
            let openQuotes = (p.match(/“/g) || []).length;
            let closeQuotes = (p.match(/”/g) || []).length;

            // Nếu số mở ngoặc nhiều hơn đóng ngoặc -> AI quên đóng ngoặc
            if(openQuotes > closeQuotes) {
                // Nếu câu kết thúc bằng dấu câu (. ? !) thì nhét ngoặc kép vào sau nó
                if(/[.!?]$/.test(p)) {
                    paragraphs[i] = p + '”';
                } else {
                    // Nếu không có dấu câu thì cứ nhét ngoặc kép vào cuối
                    paragraphs[i] = p + '”';
                }
            }
        }
        text = paragraphs.join('\n\n');
        /* ========================================================= */

        text = text.trim();
        if(!text) text = "Không tìm thấy văn bản.";

        textBox.textContent = text;
        badge.innerText = "Hoàn tất";
        loadingText.innerText = "Đã trích xuất xong";
        progress.style.width = "100%";

        copyBtn.addEventListener("click", e=>{
            e.stopPropagation();
            navigator.clipboard.writeText(text);
            copyBtn.innerText = "Đã copy";
            setTimeout(()=>{ copyBtn.innerText = "Copy text"; },1500);
        });

        const openModal = ()=>{
            modalImage.src = src; 
            modalText.textContent = text;
            currentModalText = text;
            modal.classList.add("active");
        };

        openBtn.addEventListener("click", e=>{ e.stopPropagation(); openModal(); });
        card.addEventListener("click", openModal);

    } catch(err) {
        console.error(err);
        badge.innerText = "Lỗi";
        textBox.textContent = "Không thể OCR ảnh này";
        loadingText.innerText = "OCR thất bại";
    }
}

/* UI */
function updateCounter(){ counter.innerText = `${total} / ${MAX_FILES} ảnh`; }
function toggleEmpty(){ empty.style.display = total ? "none" : "flex"; }
