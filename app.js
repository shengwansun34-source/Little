  // 加载头像缓存
    await loadAvatars();

    renderChatList();renderMessages();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();applyAvatarsToDOM();

    const savedTab=DB.get('currentTab','home');
    navigateTo(savedTab);

    // 开屏动画：1.8秒后隐藏
    setTimeout(hideSplash,1800);

    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }catch(e){
    console.error('[Little] Init error:',e);
    // 降级：即使迁移失败也尝试显示界面
    renderChatList();renderMessages();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();
    setTimeout(hideSplash,1800);
  }
}
init();
