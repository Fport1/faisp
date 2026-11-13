//! Incrusta el icono y la información de versión en faisp.exe (Windows, toolchain GNU con windres).
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=assets/faisp.rc");
    println!("cargo:rerun-if-changed=assets/faisp.ico");
    println!("cargo:rerun-if-changed=assets/WebView2Loader.dll");
    // WebView2Loader.dll (redistribuible de Microsoft) junto al .exe: con el toolchain GNU se enlaza de forma dinámica.
    if let Ok(out) = std::env::var("OUT_DIR") {
        // OUT_DIR = target/<perfil>/build/faisp-xxxx/out → subir 3 niveles
        if let Some(profile_dir) = PathBuf::from(out).ancestors().nth(3) {
            let src = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("assets").join("WebView2Loader.dll");
            let _ = std::fs::copy(&src, profile_dir.join("WebView2Loader.dll"));
        }
    }
    let target = std::env::var("TARGET").unwrap_or_default();
    if !target.contains("windows") {
        return;
    }
    if !target.contains("gnu") {
        println!("cargo:warning=Toolchain MSVC: usa el crate embed-resource para incrustar assets/faisp.rc");
        return;
    }
    let dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("assets");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("faisp_res.o");
    let ok = Command::new("windres")
        .arg("--input").arg("faisp.rc")
        .arg("--output-format=coff")
        .arg("--output").arg(&out)
        .current_dir(&dir)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        println!("cargo:rustc-link-arg-bins={}", out.display());
    } else {
        println!("cargo:warning=windres no disponible: faisp.exe se compila sin icono");
    }
}
