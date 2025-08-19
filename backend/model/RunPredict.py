import sys
from Predictor import from_pretrained, predict_one

# Main functionality for predictor

if __name__ == "__main__":
    checkpt = r"C:\Users\vnitu\Downloads\checkpoints\frognet-v1" #get checkpoint 
    wav  = sys.argv[1]  #take .wav path as argument
    model, preprocess, idx_to_class = from_pretrained(checkpt)
    name, conf, top3 = predict_one(wav, model, preprocess, idx_to_class)\
    #display top 3 predictions and confidence scores
    print(f"Prediction: {name} (confidence: {conf:.3f})")
    print("Top-3:", top3)